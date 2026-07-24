const express = require("express");
const router = express.Router();
const predictionsController = require("../controllers/predictionsController");

router.get("/", predictionsController.getAllPredictions);
router.post(
  "/",
  predictionsController.validatePrediction,
  predictionsController.createPrediction,
);
router.put("/:id", predictionsController.updatePrediction);
router.delete("/:id", predictionsController.deletePrediction);

module.exports = router;
