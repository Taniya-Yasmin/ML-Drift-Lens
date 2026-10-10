const express = require("express");
const router = express.Router();
const healthController = require("../controllers/healthController");

router.get("/health", healthController.health);
router.get("/ready", healthController.ready);
router.get("/model-info", healthController.getModelInfo);

module.exports = router;
