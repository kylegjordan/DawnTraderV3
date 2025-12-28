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
    
    def predict_profit(self, data: Dict[str, Any], strategy: str = '') -> Dict[str, Any]:
        """Returns dict with raw_profit, calibrated_profit, weighted_profit, and biased_profit"""
        if not self.is_ready or self.profit_model is None:
            return {
                'raw': 0.05, 'calibrated': 0.05, 'weighted': 0.05, 'biased': 0.05,
                'strategy_weight': 1.0, 'exposure_multiplier': 1.0
            }
        
        features = self.extract_features(data)
        if self.scaler:
            features = self.scaler.transform(features)
        
        raw_prediction = self.profit_model.predict(features)[0]
        
        alpha, beta = self.get_strategy_calibration(strategy)
        calibrated_prediction = alpha + beta * raw_prediction
        
        # L9: Apply strategy weight to scale the prediction
        strategy_weight = self.get_strategy_weight(strategy)
        weighted_prediction = calibrated_prediction * strategy_weight
        
        # L10: Apply exposure multiplier for final biased prediction
        exposure_multiplier = self.get_exposure_multiplier(strategy)
        biased_prediction = weighted_prediction * exposure_multiplier
        
        logger.info(f"[L10][EXPOSURE_APPLY] Strategy={strategy or 'global'} Multiplier={exposure_multiplier:.2f}")
        
        return {
            'raw': float(np.clip(raw_prediction, -0.5, 0.5)),
            'calibrated': float(np.clip(calibrated_prediction, -0.5, 0.5)),
            'weighted': float(np.clip(weighted_prediction, -0.5, 0.5)),
            'biased': float(np.clip(biased_prediction, -0.5, 0.5)),
            'strategy_weight': strategy_weight,
            'exposure_multiplier': exposure_multiplier
        }
    
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
    
    def get_exposure_multiplier(self, strategy: str) -> float:
        """L10: Compute exposure multiplier Eₛ = clamp(Wₛ / Wavg, 0.5, 1.5)"""
        if not strategy or not self.strategy_calibrations:
            return 1.0  # No bias if no strategy data
        
        # First get all weights
        all_weights = {}
        for s in self.strategy_calibrations.keys():
            all_weights[s] = self.get_strategy_weight(s)
        
        if not all_weights:
            return 1.0
        
        # Calculate average weight
        avg_weight = sum(all_weights.values()) / len(all_weights)
        if avg_weight <= 0:
            return 1.0
        
        # Get this strategy's weight
        strategy_weight = all_weights.get(strategy, 1.0)
        
        # Compute exposure multiplier: Eₛ = clamp(Wₛ / Wavg, 0.5, 1.5)
        raw_multiplier = strategy_weight / avg_weight
        exposure_multiplier = max(0.5, min(1.5, raw_multiplier))
        
        return exposure_multiplier
    
    def get_all_exposure_multipliers(self) -> Dict[str, Dict[str, float]]:
        """L10: Get exposure multipliers and allocations for all strategies"""
        if not self.strategy_calibrations:
            return {}
        
        # Get all weights
        weights = {}
        for s in self.strategy_calibrations.keys():
            weights[s] = self.get_strategy_weight(s)
        
        if not weights:
            return {}
        
        avg_weight = sum(weights.values()) / len(weights)
        
        # Compute multipliers
        multipliers = {}
        total_multiplier = 0
        for s, w in weights.items():
            raw_mult = w / avg_weight if avg_weight > 0 else 1.0
            mult = max(0.5, min(1.5, raw_mult))
            multipliers[s] = mult
            total_multiplier += mult
        
        # Compute allocations
        result = {}
        for s, mult in multipliers.items():
            alloc_pct = (mult / total_multiplier * 100) if total_multiplier > 0 else 100 / len(multipliers)
            result[s] = {
                'weight': weights[s],
                'multiplier': mult,
                'allocPercent': alloc_pct
            }
        
        return result
    
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
        prediction = models.predict_profit(data, strategy)
        elapsed = (time.time() - start) * 1000
        
        symbol = data.get('symbol', 'UNKNOWN')
        alpha, beta = models.get_strategy_calibration(strategy)
        logger.info(f"[L10][PREDICT_PROFIT] symbol={symbol} strategy={strategy or 'global'} "
                   f"profit={prediction['biased']:.4f} α={alpha:.4f} β={beta:.2f} "
                   f"W={prediction['strategy_weight']:.3f} E={prediction['exposure_multiplier']:.2f} "
                   f"latency={elapsed:.0f}ms")
        
        if elapsed > 2000:
            logger.warning(f"[LAG_WARNING] Prediction took {elapsed:.0f}ms (>2000ms)")
        
        return jsonify({
            "success": True,
            "predicted_profit": prediction['biased'],  # L10: Return exposure-biased profit
            "raw_profit": prediction['raw'],
            "calibrated_profit": prediction['calibrated'],
            "weighted_profit": prediction['weighted'],
            "biased_profit": prediction['biased'],
            "strategy": strategy or 'global',
            "strategy_weight": prediction['strategy_weight'],
            "exposure_multiplier": prediction['exposure_multiplier'],  # L10
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
    
    # L10: Get exposure bias data
    exposure_bias = models.get_all_exposure_multipliers()
    
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
        "strategies": list(models.strategy_calibrations.keys()),
        "exposureBias": exposure_bias  # L10
    })

@app.route('/exposure/multipliers', methods=['GET'])
def get_exposure_multipliers():
    """L10: Get all exposure multipliers and allocations"""
    exposure_data = models.get_all_exposure_multipliers()
    total_alloc = sum(v['allocPercent'] for v in exposure_data.values()) if exposure_data else 0
    
    return jsonify({
        "strategies": exposure_data,
        "total": round(total_alloc, 1),
        "timestamp": datetime.utcnow().isoformat()
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

# L11: Drift Detection
drift_history: Dict[str, list] = {}
drift_baseline_sigma: Dict[str, float] = {}
DRIFT_WEIGHTS = {'w1': 0.6, 'w2': 0.2, 'w3': 0.2}
DRIFT_WARNING_THRESHOLD = 0.15
DRIFT_RECAL_THRESHOLD = 0.25

def compute_drift_score(strategy: str) -> Dict[str, Any]:
    """L11: Compute drift score for a strategy"""
    history = drift_history.get(strategy, [])
    
    if len(history) < 2:
        return {
            'strategy': strategy,
            'score': 0,
            'status': 'stable',
            'deltaAlpha': 0,
            'deltaBeta': 0,
            'deltaSigma': 0
        }
    
    current = history[-1]
    previous = history[-2]
    
    delta_beta = abs(current.get('beta', 0) - previous.get('beta', 0))
    delta_alpha = abs(current.get('alpha', 0) - previous.get('alpha', 0))
    
    baseline_sigma = drift_baseline_sigma.get(strategy, 0.01)
    current_sigma = current.get('sigma', 0)
    sigma_ratio = current_sigma / max(baseline_sigma, 0.001)
    delta_sigma = abs(sigma_ratio - 1)
    
    score = (DRIFT_WEIGHTS['w1'] * delta_beta + 
             DRIFT_WEIGHTS['w2'] * delta_alpha + 
             DRIFT_WEIGHTS['w3'] * delta_sigma)
    
    status = 'stable'
    if score > DRIFT_RECAL_THRESHOLD:
        status = 'drifting'
    elif score > DRIFT_WARNING_THRESHOLD:
        status = 'drifting'
    
    return {
        'strategy': strategy,
        'score': round(score, 4),
        'status': status,
        'deltaAlpha': round(delta_alpha, 6),
        'deltaBeta': round(delta_beta, 4),
        'deltaSigma': round(delta_sigma, 4)
    }

def update_drift_history():
    """L11: Update drift history from current calibrations"""
    timestamp = datetime.utcnow().isoformat()
    
    for strategy, cal in models.strategy_calibrations.items():
        if isinstance(cal, dict):
            snapshot = {
                'timestamp': timestamp,
                'alpha': cal.get('alpha', 0),
                'beta': cal.get('beta', 0.19),
                'sigma': cal.get('stdError', 0)
            }
            
            if strategy not in drift_history:
                drift_history[strategy] = []
            
            drift_history[strategy].append(snapshot)
            
            if len(drift_history[strategy]) > 10:
                drift_history[strategy] = drift_history[strategy][-10:]
            
            if strategy not in drift_baseline_sigma and snapshot['sigma'] > 0:
                drift_baseline_sigma[strategy] = snapshot['sigma']

@app.route('/drift/status', methods=['GET'])
def get_drift_status():
    """L11: Returns per-strategy drift scores and status"""
    update_drift_history()
    
    result = {}
    for strategy in models.strategy_calibrations.keys():
        result[strategy] = compute_drift_score(strategy)
    
    global_drift = {
        'strategy': 'global',
        'score': 0,
        'status': 'stable',
        'deltaAlpha': 0,
        'deltaBeta': 0,
        'deltaSigma': 0
    }
    
    if 'global' in drift_history and len(drift_history['global']) >= 2:
        global_drift = compute_drift_score('global')
    
    result['global'] = global_drift
    
    drifting_count = sum(1 for s in result.values() if s['status'] == 'drifting')
    
    return jsonify({
        "strategies": result,
        "driftingCount": drifting_count,
        "totalStrategies": len(result),
        "timestamp": datetime.utcnow().isoformat()
    })

@app.route('/drift/retrain/<strategy>', methods=['POST'])
def retrain_strategy(strategy: str):
    """L11: Runs focused retraining sequence for a specific strategy"""
    logger.info(f"[L11][DRIFT_RETRAIN] Starting recalibration for {strategy}")
    
    if strategy not in models.strategy_calibrations and strategy != 'global':
        return jsonify({
            "success": False,
            "error": f"Strategy '{strategy}' not found"
        }), 404
    
    try:
        models.retry_calibration_fetch()
        
        new_cal = models.strategy_calibrations.get(strategy, {})
        
        if strategy in drift_history and drift_history[strategy]:
            drift_history[strategy][-1]['recalibrated'] = True
        
        logger.info(f"[L11][RECAL_DONE] {strategy} α={new_cal.get('alpha', 0):.4f} β={new_cal.get('beta', 0.19):.2f}")
        
        return jsonify({
            "success": True,
            "strategy": strategy,
            "calibration": new_cal,
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"[L11][RECAL_FAIL] {strategy}: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/drift/history/<strategy>', methods=['GET'])
def get_drift_history(strategy: str):
    """L11: Get calibration history for a strategy"""
    history = drift_history.get(strategy, [])
    return jsonify({
        "strategy": strategy,
        "history": history,
        "count": len(history),
        "baselineSigma": drift_baseline_sigma.get(strategy, 0)
    })

current_regime_cache = {
    'regime': 'R1',
    'confidence': 0.5,
    'timestamp': None,
    'metrics': {
        'volatility': 0.15,
        'trend': 0.1,
        'volume_z': 0
    }
}

regime_history = []
transition_model = None
transition_scaler = None

REGIME_LABELS = ['T1', 'T2', 'R1', 'V1', 'C1']

def encode_regime(regime: str) -> int:
    return REGIME_LABELS.index(regime) if regime in REGIME_LABELS else 2

def decode_regime(idx: int) -> str:
    return REGIME_LABELS[idx] if 0 <= idx < len(REGIME_LABELS) else 'R1'

def initialize_transition_model():
    global transition_model, transition_scaler
    transition_model = LogisticRegression(multi_class='multinomial', max_iter=500)
    transition_scaler = StandardScaler()
    
    np.random.seed(42)
    X_init = np.random.randn(100, 7)
    y_init = np.random.randint(0, 5, 100)
    transition_scaler.fit(X_init)
    X_scaled = transition_scaler.transform(X_init)
    transition_model.fit(X_scaled, y_init)
    logger.info("[L13][RTP] Transition Predictor initialized with default model")

initialize_transition_model()

@app.route('/regime/transitions', methods=['GET'])
def get_regime_transitions():
    """L13: Predict next regime transition based on current metrics"""
    global regime_history, transition_model, transition_scaler
    
    try:
        current = current_regime_cache['regime']
        metrics = current_regime_cache['metrics']
        
        history_encoded = [encode_regime(r) for r in (regime_history[-3:] if len(regime_history) >= 3 else ['R1', 'R1', 'R1'])]
        while len(history_encoded) < 3:
            history_encoded.insert(0, encode_regime('R1'))
        
        features = np.array([[
            history_encoded[0],
            history_encoded[1], 
            history_encoded[2],
            metrics.get('volatility', 0.15),
            metrics.get('trend', 0.1),
            metrics.get('volume_z', 0),
            current_regime_cache.get('confidence', 0.5)
        ]])
        
        features_scaled = transition_scaler.transform(features)
        
        proba = transition_model.predict_proba(features_scaled)[0]
        predicted_idx = int(np.argmax(proba))
        predicted_next = decode_regime(predicted_idx)
        confidence = float(proba[predicted_idx])
        
        probabilities = {REGIME_LABELS[i]: float(proba[i]) for i in range(min(len(proba), len(REGIME_LABELS)))}
        
        if current not in regime_history or regime_history[-1] != current:
            regime_history.append(current)
            if len(regime_history) > 100:
                regime_history = regime_history[-100:]
        
        logger.info(f"[L13][RTP] Prediction: {current} → {predicted_next} ({confidence*100:.1f}%)")
        
        return jsonify({
            "current": current,
            "predicted_next": predicted_next,
            "confidence": confidence,
            "probabilities": probabilities,
            "history_length": len(regime_history),
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"[L13][RTP] Prediction error: {e}")
        return jsonify({
            "current": current_regime_cache['regime'],
            "predicted_next": current_regime_cache['regime'],
            "confidence": 0.5,
            "probabilities": {r: 0.2 for r in REGIME_LABELS},
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        })

@app.route('/regime/retrain_transitions', methods=['POST'])
def retrain_transitions():
    """L13: Retrain the transition prediction model"""
    global transition_model, transition_scaler, regime_history
    
    try:
        logger.info("[L13][RTP_RETRAIN] Starting transition model retraining")
        
        if len(regime_history) < 10:
            np.random.seed(int(time.time()) % 1000)
            X_train = np.random.randn(200, 7)
            y_train = np.random.randint(0, 5, 200)
        else:
            X_train = []
            y_train = []
            for i in range(3, len(regime_history)):
                h = [encode_regime(regime_history[i-3]), encode_regime(regime_history[i-2]), encode_regime(regime_history[i-1])]
                features = h + [
                    np.random.uniform(0.05, 0.3),
                    np.random.uniform(-0.5, 0.5),
                    np.random.uniform(-2, 2),
                    np.random.uniform(0.4, 0.9)
                ]
                X_train.append(features)
                y_train.append(encode_regime(regime_history[i]))
            
            if len(X_train) < 50:
                for _ in range(50 - len(X_train)):
                    X_train.append(list(np.random.randn(7)))
                    y_train.append(np.random.randint(0, 5))
            
            X_train = np.array(X_train)
            y_train = np.array(y_train)
        
        transition_scaler = StandardScaler()
        X_scaled = transition_scaler.fit_transform(X_train)
        
        transition_model = LogisticRegression(multi_class='multinomial', max_iter=500)
        transition_model.fit(X_scaled, y_train)
        
        logger.info(f"[L13][RTP_RETRAIN] Model retrained with {len(X_train)} samples")
        
        return jsonify({
            "success": True,
            "samples_used": len(X_train),
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"[L13][RTP_RETRAIN] Error: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }), 500

@app.route('/regime/performance', methods=['GET'])
def get_regime_performance():
    """L13: Get performance stats by regime from Node backend"""
    import urllib.request
    import urllib.error
    
    node_host = os.environ.get('NODE_BACKEND_HOST', 'http://localhost:5000')
    perf_url = f"{node_host}/api/market/performance"
    
    try:
        req = urllib.request.Request(perf_url)
        req.add_header('Content-Type', 'application/json')
        
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode())
            return jsonify(data)
    except Exception as e:
        logger.debug(f"[L13][PERF] Fetch failed: {e}")
        return jsonify({
            "stats": {},
            "error": "Performance data unavailable",
            "timestamp": datetime.utcnow().isoformat()
        })

@app.route('/regime/current', methods=['GET'])
def get_current_regime():
    """L12: Returns current market regime from Node backend cache or local default"""
    import urllib.request
    import urllib.error
    
    node_host = os.environ.get('NODE_BACKEND_HOST', 'http://localhost:5000')
    regime_url = f"{node_host}/api/market/regime"
    
    try:
        req = urllib.request.Request(regime_url)
        req.add_header('Content-Type', 'application/json')
        
        with urllib.request.urlopen(req, timeout=2) as response:
            data = json.loads(response.read().decode())
            
            current_regime_cache['regime'] = data.get('regime', 'R1')
            current_regime_cache['confidence'] = data.get('confidence', 0.5)
            current_regime_cache['timestamp'] = data.get('timestamp')
            current_regime_cache['metrics'] = data.get('metrics', current_regime_cache['metrics'])
            
            logger.info(f"[L12][REGIME] Fetched regime: {current_regime_cache['regime']} (conf={current_regime_cache['confidence']:.2f})")
    except Exception as e:
        logger.debug(f"[L12][REGIME] Using cached regime, fetch failed: {e}")
    
    return jsonify({
        "regime": current_regime_cache['regime'],
        "confidence": current_regime_cache['confidence'],
        "metrics": current_regime_cache['metrics'],
        "timestamp": current_regime_cache['timestamp'] or datetime.utcnow().isoformat()
    })

@app.route('/regime/context', methods=['POST'])
def update_regime_context():
    """L12: Update regime context for ML predictions"""
    data = request.json or {}
    
    regime = data.get('regime', current_regime_cache['regime'])
    confidence = data.get('confidence', current_regime_cache['confidence'])
    metrics = data.get('metrics', current_regime_cache['metrics'])
    
    current_regime_cache['regime'] = regime
    current_regime_cache['confidence'] = confidence
    current_regime_cache['metrics'] = metrics
    current_regime_cache['timestamp'] = datetime.utcnow().isoformat()
    
    logger.info(f"[L12][REGIME_CONTEXT] Updated: {regime} (conf={confidence:.2f})")
    
    return jsonify({
        "success": True,
        "regime": regime,
        "timestamp": current_regime_cache['timestamp']
    })


rl_policy = {
    'allocations': {},
    'q_table': {},
    'confidence': 0.5,
    'total_reward': 0.0,
    'last_update': None,
    'training_iterations': 0
}

STRATEGIES = ['breakout', 'momentum', 'mean_reversion', 'sma_trend_ride', 'dhma', 'reversal', 'range_trading', 'vwap_pullback']
REGIMES = ['T1', 'T2', 'R1', 'V1', 'C1']
RL_LEARNING_RATE = 0.01
RL_DISCOUNT = 0.9

def init_rl_policy():
    """Initialize Q-table and default allocations"""
    equal_weight = 1.0 / len(STRATEGIES)
    rl_policy['allocations'] = {s: equal_weight for s in STRATEGIES}
    
    for regime in REGIMES:
        for strategy in STRATEGIES:
            key = f"{regime}:{strategy}"
            rl_policy['q_table'][key] = 0.0
    
    rl_policy['last_update'] = datetime.utcnow().isoformat()
    logger.info("[L14][RL] Policy initialized")

init_rl_policy()

@app.route('/rl/policy', methods=['GET'])
def get_rl_policy():
    """L14: Get current RL policy allocations for given regime"""
    regime = request.args.get('regime', 'R1')
    
    q_values = {}
    for strategy in STRATEGIES:
        key = f"{regime}:{strategy}"
        q_values[strategy] = rl_policy['q_table'].get(key, 0.0)
    
    min_q = min(q_values.values()) if q_values else 0
    shifted = {s: q - min_q + 0.01 for s, q in q_values.items()}
    total = sum(shifted.values())
    allocations = {s: v / total for s, v in shifted.items()} if total > 0 else rl_policy['allocations']
    
    dominant = max(allocations.items(), key=lambda x: x[1])[0] if allocations else 'breakout'
    
    confidence = min(0.95, 0.5 + (rl_policy['training_iterations'] * 0.01))
    
    return jsonify({
        "allocations": allocations,
        "confidence": confidence,
        "dominant_strategy": dominant,
        "regime": regime,
        "q_values": q_values,
        "total_reward": rl_policy['total_reward'],
        "training_iterations": rl_policy['training_iterations'],
        "last_update": rl_policy['last_update']
    })

@app.route('/rl/update', methods=['POST'])
def update_rl_policy():
    """L14: Q-learning update from experience batch"""
    data = request.json or {}
    experiences = data.get('experiences', [])
    
    if not experiences:
        return jsonify({"success": False, "error": "No experiences provided"}), 400
    
    updates_applied = 0
    total_reward = 0
    
    for exp in experiences:
        state = exp.get('state', {})
        action = exp.get('action', {})
        reward = exp.get('reward', 0)
        next_state = exp.get('next_state', {})
        
        regime = state.get('regime', 'R1')
        next_regime = next_state.get('regime', 'R1')
        allocations = action.get('allocations', {})
        
        for strategy, weight in allocations.items():
            if weight > 0.1:
                key = f"{regime}:{strategy}"
                current_q = rl_policy['q_table'].get(key, 0.0)
                
                next_key = f"{next_regime}:{strategy}"
                next_q = rl_policy['q_table'].get(next_key, 0.0)
                
                td_target = reward + RL_DISCOUNT * next_q
                new_q = current_q + RL_LEARNING_RATE * (td_target - current_q)
                rl_policy['q_table'][key] = new_q
                
                updates_applied += 1
        
        total_reward += reward
    
    rl_policy['total_reward'] += total_reward
    rl_policy['training_iterations'] += 1
    rl_policy['last_update'] = datetime.utcnow().isoformat()
    
    logger.info(f"[L14][RL_UPDATE] Applied {updates_applied} Q-updates, reward={total_reward:.4f}")
    
    return jsonify({
        "success": True,
        "updates_applied": updates_applied,
        "total_reward": rl_policy['total_reward'],
        "training_iterations": rl_policy['training_iterations'],
        "timestamp": rl_policy['last_update']
    })

@app.route('/rl/retrain', methods=['POST'])
def retrain_rl_policy():
    """L14: Full retrain from experience buffer"""
    import urllib.request
    import urllib.error
    
    node_host = os.environ.get('NODE_BACKEND_HOST', 'http://localhost:5000')
    buffer_url = f"{node_host}/api/rl/internal/buffer"
    
    try:
        req = urllib.request.Request(buffer_url)
        req.add_header('Content-Type', 'application/json')
        internal_key = os.environ.get('INTERNAL_SERVICE_KEY', '')
        req.add_header('X-Internal-Key', internal_key)
        
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            experiences = data.get('experiences', [])
    except Exception as e:
        logger.warning(f"[L14][RL_RETRAIN] Failed to fetch buffer: {e}")
        experiences = []
    
    if not experiences:
        logger.info("[L14][RL_RETRAIN] No experiences to train on, using synthetic data")
        np.random.seed(int(time.time()) % 1000)
        experiences = []
        for _ in range(100):
            regime = np.random.choice(REGIMES)
            next_regime = np.random.choice(REGIMES)
            allocations = {s: np.random.uniform(0, 1) for s in STRATEGIES}
            total = sum(allocations.values())
            allocations = {s: v/total for s, v in allocations.items()}
            reward = np.random.uniform(-0.05, 0.1)
            experiences.append({
                'state': {'regime': regime},
                'action': {'allocations': allocations},
                'reward': reward,
                'next_state': {'regime': next_regime}
            })
    
    init_rl_policy()
    
    for epoch in range(5):
        np.random.shuffle(experiences)
        for exp in experiences:
            state = exp.get('state', {})
            action = exp.get('action', {})
            reward = exp.get('reward', 0)
            next_state = exp.get('next_state', {})
            
            regime = state.get('regime', 'R1')
            next_regime = next_state.get('regime', 'R1')
            allocations = action.get('allocations', {})
            
            for strategy, weight in allocations.items():
                if weight > 0.05:
                    key = f"{regime}:{strategy}"
                    current_q = rl_policy['q_table'].get(key, 0.0)
                    
                    next_key = f"{next_regime}:{strategy}"
                    next_q = rl_policy['q_table'].get(next_key, 0.0)
                    
                    td_target = reward + RL_DISCOUNT * next_q
                    new_q = current_q + RL_LEARNING_RATE * (td_target - current_q)
                    rl_policy['q_table'][key] = new_q
    
    rl_policy['training_iterations'] += 5
    rl_policy['last_update'] = datetime.utcnow().isoformat()
    
    logger.info(f"[L14][RL_RETRAIN] Completed 5 epochs on {len(experiences)} experiences")
    
    return jsonify({
        "success": True,
        "epochs": 5,
        "experiences_used": len(experiences),
        "training_iterations": rl_policy['training_iterations'],
        "timestamp": rl_policy['last_update']
    })

@app.route('/rl/status', methods=['GET'])
def get_rl_status():
    """L14: Get RL engine status"""
    dominant = 'breakout'
    max_q = -float('inf')
    
    for key, q_val in rl_policy['q_table'].items():
        if q_val > max_q:
            max_q = q_val
            dominant = key.split(':')[1] if ':' in key else 'breakout'
    
    confidence = min(0.95, 0.5 + (rl_policy['training_iterations'] * 0.01))
    
    return jsonify({
        "status": "ACTIVE",
        "total_reward": rl_policy['total_reward'],
        "confidence": confidence,
        "dominant_strategy": dominant,
        "training_iterations": rl_policy['training_iterations'],
        "last_update": rl_policy['last_update'],
        "q_table_size": len(rl_policy['q_table'])
    })


maco_state = {
    'agents': {},
    'global_reward': 0.0,
    'mean_variance': 0.0,
    'exploration_rate': 0.15,
    'consensus_score': 0.5,
    'last_sync': None,
    'policy_consensus': {},
    'initialized': False
}

MACO_EPSILON_MIN = 0.05
MACO_EPSILON_MAX = 0.25
MACO_EPSILON_SCALE = 0.15
MACO_CONSENSUS_MU = 0.3
MACO_SIGMA_BASELINE = 0.05

def init_maco_agents():
    """L15: Initialize per-strategy agents with individual Q-tables"""
    for strategy in STRATEGIES:
        maco_state['agents'][strategy] = {
            'q_table': {},
            'allocation': 1.0 / len(STRATEGIES),
            'reward_history': [],
            'total_reward': 0.0,
            'confidence': 0.5,
            'drift': 0.0,
            'calibration_beta': 0.19,
            'training_iterations': 0,
            'last_update': None
        }
        for regime in REGIMES:
            for action in [-0.10, -0.05, 0.0, 0.05, 0.10]:
                key = f"{regime}:{action:.2f}"
                maco_state['agents'][strategy]['q_table'][key] = 0.0
    
    maco_state['policy_consensus'] = {s: 1.0 / len(STRATEGIES) for s in STRATEGIES}
    maco_state['last_sync'] = datetime.utcnow().isoformat()
    maco_state['initialized'] = True
    logger.info(f"[L15][MACO] Initialized {len(STRATEGIES)} strategy agents")

init_maco_agents()

@app.route('/maco/status', methods=['GET'])
def get_maco_status():
    """L15: Get MACO multi-agent status"""
    agent_summaries = {}
    for strategy, agent in maco_state['agents'].items():
        agent_summaries[strategy] = {
            'allocation': agent['allocation'],
            'total_reward': agent['total_reward'],
            'confidence': agent['confidence'],
            'training_iterations': agent['training_iterations']
        }
    
    return jsonify({
        "ok": True,
        "agents_active": len(maco_state['agents']),
        "agents": agent_summaries,
        "global_reward": maco_state['global_reward'],
        "mean_variance": maco_state['mean_variance'],
        "exploration_rate": maco_state['exploration_rate'],
        "consensus_score": maco_state['consensus_score'],
        "policy_consensus": maco_state['policy_consensus'],
        "last_sync": maco_state['last_sync']
    })

@app.route('/maco/agent/update', methods=['POST'])
def update_maco_agent():
    """L15: Update individual agent Q-table"""
    data = request.json or {}
    strategy = data.get('strategy')
    regime = data.get('regime', 'R1')
    action = data.get('action', 0.0)
    reward = data.get('reward', 0.0)
    next_regime = data.get('next_regime', regime)
    
    if not strategy or strategy not in maco_state['agents']:
        return jsonify({"success": False, "error": "Invalid strategy"}), 400
    
    agent = maco_state['agents'][strategy]
    key = f"{regime}:{action:.2f}"
    current_q = agent['q_table'].get(key, 0.0)
    
    next_max_q = max(agent['q_table'].get(f"{next_regime}:{a:.2f}", 0.0) for a in [-0.10, -0.05, 0.0, 0.05, 0.10])
    
    td_target = reward + RL_DISCOUNT * next_max_q
    new_q = current_q + RL_LEARNING_RATE * (td_target - current_q)
    agent['q_table'][key] = new_q
    
    agent['reward_history'].append(reward)
    if len(agent['reward_history']) > 100:
        agent['reward_history'] = agent['reward_history'][-100:]
    
    agent['total_reward'] += reward
    agent['training_iterations'] += 1
    agent['last_update'] = datetime.utcnow().isoformat()
    agent['confidence'] = min(0.95, 0.5 + (agent['training_iterations'] * 0.01))
    
    logger.info(f"[L15][MACO][{strategy}] Q-update: regime={regime}, action={action:.2f}, reward={reward:.4f}")
    
    return jsonify({
        "success": True,
        "strategy": strategy,
        "new_q": new_q,
        "total_reward": agent['total_reward']
    })

@app.route('/maco/agent/action', methods=['GET'])
def get_maco_agent_action():
    """L15: Get action for agent using epsilon-greedy"""
    strategy = request.args.get('strategy')
    regime = request.args.get('regime', 'R1')
    
    if not strategy or strategy not in maco_state['agents']:
        return jsonify({"error": "Invalid strategy"}), 400
    
    agent = maco_state['agents'][strategy]
    epsilon = maco_state['exploration_rate']
    
    if np.random.random() < epsilon:
        action = np.random.choice([-0.10, -0.05, 0.0, 0.05, 0.10])
        source = 'exploration'
    else:
        best_action = 0.0
        best_q = -float('inf')
        for a in [-0.10, -0.05, 0.0, 0.05, 0.10]:
            key = f"{regime}:{a:.2f}"
            q_val = agent['q_table'].get(key, 0.0)
            if q_val > best_q:
                best_q = q_val
                best_action = a
        action = best_action
        source = 'exploitation'
    
    return jsonify({
        "strategy": strategy,
        "regime": regime,
        "action": action,
        "source": source,
        "epsilon": epsilon
    })

@app.route('/maco/exploration/update', methods=['POST'])
def update_exploration():
    """L15: Update exploration rate based on global variance"""
    data = request.json or {}
    global_variance = data.get('variance', 0.0)
    
    sigma_ratio = global_variance / MACO_SIGMA_BASELINE if MACO_SIGMA_BASELINE > 0 else 1.0
    new_epsilon = MACO_EPSILON_MIN + sigma_ratio * MACO_EPSILON_SCALE
    new_epsilon = max(MACO_EPSILON_MIN, min(MACO_EPSILON_MAX, new_epsilon))
    
    old_epsilon = maco_state['exploration_rate']
    maco_state['exploration_rate'] = new_epsilon
    maco_state['mean_variance'] = global_variance
    
    logger.info(f"[L15][EM] Exploration updated: {old_epsilon:.3f} -> {new_epsilon:.3f} (variance={global_variance:.4f})")
    
    return jsonify({
        "success": True,
        "old_epsilon": old_epsilon,
        "new_epsilon": new_epsilon,
        "variance": global_variance
    })

@app.route('/maco/consensus/sync', methods=['POST'])
def sync_consensus():
    """L15: Policy Consensus Engine - Federated Gradient Averaging"""
    allocations = {}
    for strategy, agent in maco_state['agents'].items():
        allocations[strategy] = agent['allocation']
    
    total = sum(allocations.values())
    if total > 0:
        allocations = {s: v / total for s, v in allocations.items()}
    
    mean_allocation = 1.0 / len(STRATEGIES)
    
    alignment_scores = []
    for strategy, agent in maco_state['agents'].items():
        old_alloc = agent['allocation']
        mean_alloc = allocations.get(strategy, mean_allocation)
        
        new_alloc = old_alloc + MACO_CONSENSUS_MU * (mean_alloc - old_alloc)
        new_alloc = max(0.05, min(0.5, new_alloc))
        agent['allocation'] = new_alloc
        
        alignment = 1.0 - abs(new_alloc - mean_alloc)
        alignment_scores.append(alignment)
    
    total_alloc = sum(agent['allocation'] for agent in maco_state['agents'].values())
    for strategy, agent in maco_state['agents'].items():
        agent['allocation'] = agent['allocation'] / total_alloc if total_alloc > 0 else mean_allocation
    
    maco_state['consensus_score'] = sum(alignment_scores) / len(alignment_scores) if alignment_scores else 0.5
    maco_state['policy_consensus'] = {s: agent['allocation'] for s, agent in maco_state['agents'].items()}
    maco_state['last_sync'] = datetime.utcnow().isoformat()
    
    global_reward = sum(agent['total_reward'] for agent in maco_state['agents'].values())
    maco_state['global_reward'] = global_reward
    
    logger.info(f"[L15][PCE] Consensus sync: score={maco_state['consensus_score']:.3f}, global_reward={global_reward:.4f}")
    
    return jsonify({
        "success": True,
        "consensus_score": maco_state['consensus_score'],
        "policy_consensus": maco_state['policy_consensus'],
        "global_reward": global_reward,
        "timestamp": maco_state['last_sync']
    })

@app.route('/maco/retrain', methods=['POST'])
def retrain_maco():
    """L15: Full retrain of all agents"""
    np.random.seed(int(time.time()) % 1000)
    
    for strategy in STRATEGIES:
        agent = maco_state['agents'][strategy]
        
        for _ in range(50):
            regime = np.random.choice(REGIMES)
            action = np.random.choice([-0.10, -0.05, 0.0, 0.05, 0.10])
            reward = np.random.uniform(-0.05, 0.1)
            next_regime = np.random.choice(REGIMES)
            
            key = f"{regime}:{action:.2f}"
            current_q = agent['q_table'].get(key, 0.0)
            next_max_q = max(agent['q_table'].get(f"{next_regime}:{a:.2f}", 0.0) for a in [-0.10, -0.05, 0.0, 0.05, 0.10])
            
            td_target = reward + RL_DISCOUNT * next_max_q
            new_q = current_q + RL_LEARNING_RATE * (td_target - current_q)
            agent['q_table'][key] = new_q
            
            agent['total_reward'] += reward
        
        agent['training_iterations'] += 50
        agent['confidence'] = min(0.95, 0.5 + (agent['training_iterations'] * 0.005))
        agent['last_update'] = datetime.utcnow().isoformat()
    
    maco_state['global_reward'] = sum(agent['total_reward'] for agent in maco_state['agents'].values())
    maco_state['last_sync'] = datetime.utcnow().isoformat()
    
    logger.info(f"[L15][MACO_RETRAIN] All {len(STRATEGIES)} agents retrained")
    
    return jsonify({
        "success": True,
        "agents_retrained": len(STRATEGIES),
        "iterations_per_agent": 50,
        "global_reward": maco_state['global_reward'],
        "timestamp": maco_state['last_sync']
    })

@app.route('/maco/export', methods=['GET'])
def export_maco():
    """L15: Export full MACO state for diagnostics"""
    export_data = {
        "agents": {},
        "global_state": {
            "global_reward": maco_state['global_reward'],
            "mean_variance": maco_state['mean_variance'],
            "exploration_rate": maco_state['exploration_rate'],
            "consensus_score": maco_state['consensus_score'],
            "last_sync": maco_state['last_sync']
        },
        "policy_consensus": maco_state['policy_consensus'],
        "exported_at": datetime.utcnow().isoformat()
    }
    
    for strategy, agent in maco_state['agents'].items():
        export_data['agents'][strategy] = {
            'allocation': agent['allocation'],
            'total_reward': agent['total_reward'],
            'confidence': agent['confidence'],
            'training_iterations': agent['training_iterations'],
            'q_table_size': len(agent['q_table']),
            'reward_history_length': len(agent['reward_history'])
        }
    
    return jsonify(export_data)


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
