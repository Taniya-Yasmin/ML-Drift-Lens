const express = require("express");
const router = express.Router();
const alertsController = require("../controllers/alertsController");

router.get("/", alertsController.getAllAlerts);
router.post("/", alertsController.validateAlert, alertsController.createAlert);
router.put("/:id", alertsController.updateAlert);
router.delete("/:id", alertsController.deleteAlert);

module.exports = router;
