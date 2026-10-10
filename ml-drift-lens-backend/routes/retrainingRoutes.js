const express = require("express");
const router = express.Router();
const retrainingController = require("../controllers/retrainingController");
const { requireTrustedOrigin } = require("../utils/cors");

router.get("/", retrainingController.getAllRetrainingJobs);
router.post(
  "/",
  retrainingController.validateRetrainingJob,
  retrainingController.createRetrainingJob,
);
router.post(
  "/:id/promote",
  requireTrustedOrigin,
  retrainingController.promoteRetrainingJob,
);
router.put("/:id", retrainingController.updateRetrainingJob);
router.delete("/:id", retrainingController.deleteRetrainingJob);

module.exports = router;
