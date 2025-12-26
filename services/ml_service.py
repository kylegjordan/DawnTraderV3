"""
Directive 8.8.4-L3: Python ML Microservice
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
        
        self.is_ready = True
        elapsed = (time.time() - start_time) * 1000
        logger.info(f"[INIT_OK] Models initialized in {elapsed:.0f}ms")
        
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
    
    def predict_profit(self, data: Dict[str, Any]) -> float:
        if not self.is_ready or self.profit_model is None:
            return 0.05
        
        features = self.extract_features(data)
        if self.scaler:
            features = self.scaler.transform(features)
        
        prediction = self.profit_model.predict(features)[0]
        return float(np.clip(prediction, -0.5, 0.5))
    
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
    return jsonify({
        "status": "READY" if models.is_ready else "INITIALIZING",
        "timestamp": datetime.utcnow().isoformat()
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
        profit = models.predict_profit(data)
        elapsed = (time.time() - start) * 1000
        
        symbol = data.get('symbol', 'UNKNOWN')
        logger.info(f"[PREDICT_PROFIT] symbol={symbol} profit={profit:.4f} latency={elapsed:.0f}ms")
        
        if elapsed > 2000:
            logger.warning(f"[LAG_WARNING] Prediction took {elapsed:.0f}ms (>2000ms)")
        
        return jsonify({
            "success": True,
            "predicted_profit": profit,
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
        }
    })

def main():
    port = int(os.environ.get('ML_SERVICE_PORT', 5001))
    logger.info(f"[STARTUP] Starting ML Service on port {port}")
    
    models.initialize()
    
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)

if __name__ == '__main__':
    main()
