const express = require("express");
const router = express.Router();
const driftController = require("../controllers/driftController");

router.get("/", driftController.getAllDriftScores);
router.post(
  "/",
  driftController.validateDriftScore,
  driftController.createDriftScore,
);
router.put("/:id", driftController.updateDriftScore);
router.delete("/:id", driftController.deleteDriftScore);

module.exports = router;
