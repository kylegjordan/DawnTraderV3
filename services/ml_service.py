"""
Directive 8.8.4-L8: Python ML Microservice with Per-Strategy Calibration
Serves model predictions via REST endpoints for SQE, RTB, and Signal Orchestrator.
"""

import os
import sys
import json
import time
import pickle
import hashlib
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

try:
    from flask import Flask, request, jsonify
except ImportError:
    print("[ML_SERVICE][ERROR] Flask not installed. Run: pip install flask")
    sys.exit(1)

try:
    import numpy as np
except ImportError:
    print("[ML_SERVICE][ERROR] NumPy not installed. Run: pip install numpy")
    sys.exit(1)

try:
    from sklearn.linear_model import LogisticRegression, Ridge
    from sklearn.preprocessing import StandardScaler
except ImportError:
    print("[ML_SERVICE][ERROR] scikit-learn not installed. Run: pip install scikit-learn")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format='[ML_SERVICE] %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

MODEL_DIR = Path("models")
MODEL_DIR.mkdir(exist_ok=True)

class MLModels:
    def __init__(self):
        self.promotion_model: Optional[LogisticRegression] = None
        self.profit_model: Optional[Ridge] = None
        self.scaler: Optional[StandardScaler] = None
        self.promotion_version = "v1.0"
        self.profit_version = "v1.0"
        self.last_train_time: Optional[str] = None
        self.is_ready = False
        self.calibration_alpha: float = 0.0018
        self.calibration_beta: float = 0.19
        self.calibration_loaded: bool = False
        self.strategy_calibrations: Dict[str, Dict[str, float]] = {}
        
    def initialize(self):
        logger.info("[INIT] Initializing ML models...")
        start_time = time.time()
        
        promotion_path = MODEL_DIR / "promotion_classifier.pkl"
        profit_path = MODEL_DIR / "profit_regressor.pkl"
        scaler_path = MODEL_DIR / "scaler.pkl"
        
        if promotion_path.exists() and profit_path.exists():
            try:
                with open(promotion_path, 'rb') as f:
                    self.promotion_model = pickle.load(f)
                with open(profit_path, 'rb') as f:
                    self.profit_model = pickle.load(f)
                if scaler_path.exists():
                    with open(scaler_path, 'rb') as f:
                        self.scaler = pickle.load(f)
                logger.info("[INIT] Loaded existing models from disk")
                self._load_versions()
            except Exception as e:
                logger.warning(f"[INIT] Failed to load models: {e}. Creating defaults.")
                self._create_default_models()
        else:
            logger.info("[INIT] No existing models. Creating default models...")
            self._create_default_models()
        
        self._fetch_vts_calibration()
        
        self.is_ready = True
        elapsed = (time.time() - start_time) * 1000
        logger.info(f"[INIT_OK] Models initialized in {elapsed:.0f}ms")
    
    def _fetch_vts_calibration(self, is_deferred: bool = False):
        """L8: Fetch VTS calibration coefficients including per-strategy values from Node backend"""
        import urllib.request
        import urllib.error
        
        node_host = os.environ.get('NODE_BACKEND_HOST', 'http://localhost:5000')
        internal_key = os.environ.get('INTERNAL_SERVICE_KEY', '')
        vts_calibration_url = f"{node_host}/api/vts/internal/calibration"
        
        max_retries = 5 if is_deferred else 3
        retry_delay = 3 if is_deferred else 2
        
        for attempt in range(max_retries):
            try:
                req = urllib.request.Request(vts_calibration_url)
                req.add_header('Content-Type', 'application/json')
                req.add_header('X-Internal-Key', internal_key)
                
                with urllib.request.urlopen(req, timeout=5) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    
                    if 'calibration' in data and data['calibration']:
                        cal = data['calibration']
                        self.calibration_alpha = float(cal.get('alpha', 0.0018))
                        self.calibration_beta = float(cal.get('beta', 0.19))
                        self.calibration_loaded = True
                        logger.info(f"[L8][CALIB_APPLY] Global: α={self.calibration_alpha:.4f} β={self.calibration_beta:.2f}")
                    
                    if 'strategies' in data and data['strategies']:
                        self.strategy_calibrations = {}
                        for strategy, cal in data['strategies'].items():
                            self.strategy_calibrations[strategy] = {
                                'alpha': float(cal.get('alpha', 0.0018)),
                                'beta': float(cal.get('beta', 0.19)),
                                'sampleCount': int(cal.get('sampleCount', 0))
                            }
                            logger.info(f"[L8][CALIB_APPLY] {strategy} α={cal['alpha']:.4f} β={cal['beta']:.2f}")
                        
                        logger.info(f"[L8][CALIB_APPLY] Loaded {len(self.strategy_calibrations)} strategy calibrations")
                    
                    return True
                        
            except urllib.error.URLError as e:
                logger.warning(f"[L8][CALIB_FETCH] Attempt {attempt+1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
            except Exception as e:
                logger.warning(f"[L8][CALIB_FETCH] Error: {e}")
                break
        
        logger.info(f"[L8][CALIB_FALLBACK] Using default α={self.calibration_alpha:.4f} β={self.calibration_beta:.2f}")
        return False
    
    def retry_calibration_fetch(self):
        """Retry fetching calibration if initial fetch failed"""
        if not self.calibration_loaded:
            logger.info("[L8][CALIB_RETRY] Retrying calibration fetch...")
            return self._fetch_vts_calibration(is_deferred=True)
        return True
    
    def get_strategy_calibration(self, strategy: str) -> tuple:
        """Get calibration coefficients for a specific strategy, fallback to global"""
        if strategy and strategy in self.strategy_calibrations:
            cal = self.strategy_calibrations[strategy]
            if cal.get('sampleCount', 0) >= 10:
                return cal['alpha'], cal['beta']
        return self.calibration_alpha, self.calibration_beta
        
    def _create_default_models(self):
        np.random.seed(42)
        n_samples = 100
        
        X = np.random.rand(n_samples, 7)
        y_promotion = (X[:, 0] * 0.3 + X[:, 1] * 0.4 + X[:, 2] * 0.3 > 0.5).astype(int)
        y_profit = X[:, 0] * 0.15 + X[:, 1] * 0.1 - X[:, 2] * 0.05 + np.random.randn(n_samples) * 0.02
        
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        
        self.promotion_model = LogisticRegression(max_iter=200)
        self.promotion_model.fit(X_scaled, y_promotion)
        
        self.profit_model = Ridge(alpha=1.0)
        self.profit_model.fit(X_scaled, y_profit)
        
        self._save_models()
        self.last_train_time = datetime.utcnow().isoformat()
        logger.info("[INIT] Default models created and saved")
        
    def _save_models(self):
        with open(MODEL_DIR / "promotion_classifier.pkl", 'wb') as f:
            pickle.dump(self.promotion_model, f)
        with open(MODEL_DIR / "profit_regressor.pkl", 'wb') as f:
            pickle.dump(self.profit_model, f)
        with open(MODEL_DIR / "scaler.pkl", 'wb') as f:
            pickle.dump(self.scaler, f)
            
        version_info = {
            "promotion_version": self.promotion_version,
            "profit_version": self.profit_version,
            "last_train_time": self.last_train_time or datetime.utcnow().isoformat(),
            "features": ["ngc", "cwqi", "riskRatio", "profitTarget", "signalAge", "priceRange", "stopDepth"]
        }
        with open(MODEL_DIR / "model_versions.json", 'w') as f:
            json.dump(version_info, f, indent=2)
            
    def _load_versions(self):
        version_path = MODEL_DIR / "model_versions.json"
        if version_path.exists():
            with open(version_path, 'r') as f:
                info = json.load(f)
                self.promotion_version = info.get("promotion_version", "v1.0")
                self.profit_version = info.get("profit_version", "v1.0")
                self.last_train_time = info.get("last_train_time")
                
    def extract_features(self, data: Dict[str, Any]) -> np.ndarray:
        ngc = float(data.get('ngc', 0.5))
        cwqi = float(data.get('cwqi', 0.5))
        risk_ratio = float(data.get('riskRatio', 1.0))
        profit_target = float(data.get('profitTarget', 0.1))
        signal_age = float(data.get('signalAge', 0)) / 3600.0
        
        entry = float(data.get('entry', 1.0))
        exit_price = float(data.get('exit', entry * 1.01))
        stop = float(data.get('stop', entry * 0.99))
        
        price_range = (exit_price - entry) / max(entry, 0.0001)
        stop_depth = (entry - stop) / max(entry, 0.0001)
        
        return np.array([[ngc, cwqi, risk_ratio, profit_target, signal_age, price_range, stop_depth]])
    
    def predict_promotion(self, data: Dict[str, Any]) -> float:
        if not self.is_ready or self.promotion_model is None:
            return 0.5
        
        features = self.extract_features(data)
        if self.scaler:
            features = self.scaler.transform(features)
        
        prob = self.promotion_model.predict_proba(features)[0]
        return float(prob[1]) if len(prob) > 1 else float(prob[0])
    
    def predict_profit(self, data: Dict[str, Any], strategy: str = '') -> float:
        if not self.is_ready or self.profit_model is None:
            return 0.05
        
        features = self.extract_features(data)
        if self.scaler:
            features = self.scaler.transform(features)
        
        raw_prediction = self.profit_model.predict(features)[0]
        
        alpha, beta = self.get_strategy_calibration(strategy)
        calibrated_prediction = alpha + beta * raw_prediction
        
        # L9: Apply strategy weight to scale the prediction
        strategy_weight = self.get_strategy_weight(strategy)
        weighted_prediction = calibrated_prediction * strategy_weight
        
        return float(np.clip(weighted_prediction, -0.5, 0.5))
    
    def get_strategy_weight(self, strategy: str) -> float:
        """L9: Compute strategy weight from reliability score"""
        if not strategy or not self.strategy_calibrations:
            return 1.0  # No weighting if no strategy data
        
        # Compute reliability scores for all strategies
        reliabilities = {}
        max_std_error = 0.001
        
        for s, cal in self.strategy_calibrations.items():
            std_error = cal.get('stdError', 0) if isinstance(cal, dict) else 0
            max_std_error = max(max_std_error, std_error)
        
        for s, cal in self.strategy_calibrations.items():
            if isinstance(cal, dict):
                beta = cal.get('beta', 0.19)
                std_error = cal.get('stdError', 0)
                sample_count = cal.get('sampleCount', 0)
                
                if sample_count < 10:
                    reliabilities[s] = 0.5  # Default for insufficient samples
                else:
                    beta_deviation = abs(beta - 1.0)
                    normalized_error = std_error / max_std_error if max_std_error > 0 else 0
                    reliability = max(0, min(1, 1 - beta_deviation - normalized_error))
                    reliabilities[s] = reliability
        
        if not reliabilities:
            return 1.0
        
        total_reliability = sum(reliabilities.values())
        if total_reliability == 0:
            return 1.0 / len(reliabilities) if reliabilities else 1.0
        
        weight = reliabilities.get(strategy, 0.5) / total_reliability * len(reliabilities)
        return max(0.1, min(2.0, weight))  # Clamp between 0.1x and 2.0x
    
    def _compute_sdpoe_weights(self, outcomes: list) -> np.ndarray:
        rewards = []
        for sample in outcomes:
            profit_rate = float(sample.get('profitRate', 0.0))
            accuracy = 1.0 if sample.get('tradeExecuted', False) else 0.0
            stability = 1.0 - min(abs(profit_rate), 0.5) / 0.5
            
            reward = (profit_rate * 0.6) + (accuracy * 0.3) + (stability * 0.1)
            rewards.append(max(reward, 0.01))
        
        rewards = np.array(rewards)
        weights = rewards / rewards.sum() * len(rewards)
        
        logger.info(f"[SDPOE][REWARD_UPDATE] min={weights.min():.3f}, max={weights.max():.3f}, mean={weights.mean():.3f}")
        
        return weights

    def train(self, dataset: list, use_sdpoe: bool = True) -> Dict[str, Any]:
        if len(dataset) < 10:
            return {"success": False, "error": "Insufficient training data (need >= 10 samples)"}
        
        logger.info(f"[TRAIN] Starting training with {len(dataset)} samples (SDPOE={use_sdpoe})")
        start_time = time.time()
        
        try:
            X_list = []
            y_promotion = []
            y_profit = []
            
            for sample in dataset:
                features = self.extract_features(sample)
                X_list.append(features[0])
                y_promotion.append(1 if sample.get('tradeExecuted', False) else 0)
                y_profit.append(float(sample.get('profitRate', 0.0)))
            
            X = np.array(X_list)
            y_prom = np.array(y_promotion)
            y_prof = np.array(y_profit)
            
            if use_sdpoe:
                sample_weights = self._compute_sdpoe_weights(dataset)
            else:
                sample_weights = np.ones(len(dataset))
            
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)
            
            self.promotion_model = LogisticRegression(max_iter=500)
            self.promotion_model.fit(X_scaled, y_prom, sample_weight=sample_weights)
            
            self.profit_model = Ridge(alpha=1.0)
            self.profit_model.fit(X_scaled, y_prof, sample_weight=sample_weights)
            
            self.promotion_version = f"v{int(self.promotion_version[1:].split('.')[0]) + 1}.0"
            self.profit_version = f"v{int(self.profit_version[1:].split('.')[0]) + 1}.0"
            self.last_train_time = datetime.utcnow().isoformat()
            
            self._save_models()
            
            elapsed = (time.time() - start_time) * 1000
            
            prom_score = self.promotion_model.score(X_scaled, y_prom)
            prof_score = self.profit_model.score(X_scaled, y_prof)
            
            logger.info(f"[MODEL_UPDATE] promotion_{self.promotion_version}.model profit_{self.profit_version}.model")
            logger.info(f"[MODEL_TRAIN][promotionClassifier] Accuracy={prom_score:.2f}")
            logger.info(f"[MODEL_TRAIN][profitRegressor] R2={prof_score:.2f}")
            
            return {
                "success": True,
                "samples": len(dataset),
                "elapsed_ms": elapsed,
                "promotion_version": self.promotion_version,
                "profit_version": self.profit_version,
                "promotion_accuracy": prom_score,
                "profit_r2": prof_score
            }
            
        except Exception as e:
            logger.error(f"[TRAIN_ERROR] {e}")
            return {"success": False, "error": str(e)}

models = MLModels()

@app.route('/health', methods=['GET'])
def health():
    strategy_count = len(models.strategy_calibrations)
    return jsonify({
        "status": "READY" if models.is_ready else "INITIALIZING",
        "timestamp": datetime.utcnow().isoformat(),
        "calibration": {
            "loaded": models.calibration_loaded,
            "alpha": models.calibration_alpha,
            "beta": models.calibration_beta,
            "strategyCount": strategy_count
        }
    })

@app.route('/predict/promotion', methods=['POST'])
def predict_promotion():
    start = time.time()
    try:
        data = request.get_json() or {}
        probability = models.predict_promotion(data)
        elapsed = (time.time() - start) * 1000
        
        symbol = data.get('symbol', 'UNKNOWN')
        logger.info(f"[PREDICT_PROMOTION] symbol={symbol} prob={probability:.4f} latency={elapsed:.0f}ms")
        
        if elapsed > 2000:
            logger.warning(f"[LAG_WARNING] Prediction took {elapsed:.0f}ms (>2000ms)")
        
        return jsonify({
            "success": True,
            "probability": probability,
            "latency_ms": elapsed
        })
    except Exception as e:
        logger.error(f"[PREDICT_ERROR] {e}")
        return jsonify({"success": False, "error": str(e), "probability": 0.5}), 500

@app.route('/predict/profit', methods=['POST'])
def predict_profit():
    start = time.time()
    try:
        data = request.get_json() or {}
        strategy = data.get('strategy', '')
        profit = models.predict_profit(data, strategy)
        strategy_weight = models.get_strategy_weight(strategy)
        elapsed = (time.time() - start) * 1000
        
        symbol = data.get('symbol', 'UNKNOWN')
        alpha, beta = models.get_strategy_calibration(strategy)
        logger.info(f"[L9][PREDICT_PROFIT] symbol={symbol} strategy={strategy or 'global'} profit={profit:.4f} α={alpha:.4f} β={beta:.2f} W={strategy_weight:.3f} latency={elapsed:.0f}ms")
        
        if elapsed > 2000:
            logger.warning(f"[LAG_WARNING] Prediction took {elapsed:.0f}ms (>2000ms)")
        
        return jsonify({
            "success": True,
            "predicted_profit": profit,
            "strategy": strategy or 'global',
            "strategy_weight": strategy_weight,
            "calibration": {"alpha": alpha, "beta": beta},
            "latency_ms": elapsed
        })
    except Exception as e:
        logger.error(f"[PREDICT_ERROR] {e}")
        return jsonify({"success": False, "error": str(e), "predicted_profit": 0.05}), 500

@app.route('/train', methods=['POST'])
def train():
    training_enabled = os.environ.get('ML_SERVICE_TRAINING_ENABLED', 'false').lower() == 'true'
    
    if not training_enabled:
        return jsonify({
            "success": False,
            "error": "Training is disabled in development mode"
        }), 403
    
    try:
        data = request.get_json() or {}
        dataset = data.get('dataset', [])
        
        if not isinstance(dataset, list):
            return jsonify({"success": False, "error": "Dataset must be a list"}), 400
        
        result = models.train(dataset)
        return jsonify(result)
    except Exception as e:
        logger.error(f"[TRAIN_ERROR] {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/version', methods=['GET'])
def version():
    return jsonify({
        "promotion_version": models.promotion_version,
        "profit_version": models.profit_version,
        "last_train_time": models.last_train_time,
        "is_ready": models.is_ready
    })

@app.route('/metrics', methods=['GET'])
def metrics():
    import psutil
    process = psutil.Process()
    memory_mb = process.memory_info().rss / (1024 * 1024)
    cpu_percent = process.cpu_percent(interval=0.1)
    
    if memory_mb > 500:
        logger.warning(f"[MEMORY_WARNING] Memory usage {memory_mb:.0f}MB (>500MB)")
    
    return jsonify({
        "memory_mb": memory_mb,
        "cpu_percent": cpu_percent,
        "is_ready": models.is_ready,
        "model_versions": {
            "promotion": models.promotion_version,
            "profit": models.profit_version
        },
        "calibration": {
            "alpha": models.calibration_alpha,
            "beta": models.calibration_beta,
            "loaded": models.calibration_loaded,
            "strategyCount": len(models.strategy_calibrations)
        },
        "strategies": list(models.strategy_calibrations.keys())
    })

@app.route('/calibration/refresh', methods=['POST'])
def refresh_calibration():
    """L8: Endpoint to trigger full calibration refresh including per-strategy"""
    success = models.retry_calibration_fetch()
    return jsonify({
        "success": success,
        "calibration": {
            "alpha": models.calibration_alpha,
            "beta": models.calibration_beta,
            "loaded": models.calibration_loaded,
            "strategyCount": len(models.strategy_calibrations)
        },
        "strategies": models.strategy_calibrations
    })

@app.route('/calibration/strategies', methods=['GET'])
def get_strategy_calibrations():
    """L8: Get all per-strategy calibration coefficients"""
    return jsonify({
        "global": {
            "alpha": models.calibration_alpha,
            "beta": models.calibration_beta
        },
        "strategies": models.strategy_calibrations,
        "loaded": models.calibration_loaded
    })

def deferred_calibration_fetch():
    """Wait for Node.js backend to be ready, then fetch calibration"""
    import threading
    
    def fetch_after_delay():
        time.sleep(10)
        if not models.calibration_loaded:
            logger.info("[L8][DEFERRED] Node backend should be ready, retrying calibration fetch...")
            models.retry_calibration_fetch()
    
    thread = threading.Thread(target=fetch_after_delay, daemon=True)
    thread.start()

def main():
    port = int(os.environ.get('ML_SERVICE_PORT', 5001))
    logger.info(f"[STARTUP] Starting ML Service on port {port}")
    
    models.initialize()
    
    deferred_calibration_fetch()
    
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)

if __name__ == '__main__':
    main()
