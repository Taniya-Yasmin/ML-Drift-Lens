const express = require("express");
const router = express.Router();
const retrainingController = require("../controllers/retrainingController");

router.get("/", retrainingController.getAllRetrainingJobs);
router.post(
  "/",
  retrainingController.validateRetrainingJob,
  retrainingController.createRetrainingJob,
);
router.put("/:id", retrainingController.updateRetrainingJob);
router.delete("/:id", retrainingController.deleteRetrainingJob);

module.exports = router;
