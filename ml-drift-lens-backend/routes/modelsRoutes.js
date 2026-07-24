const express = require("express");
const router = express.Router();
const modelsController = require("../controllers/modelsController");

router.get("/", modelsController.getAllModels);
router.post("/", modelsController.validateModel, modelsController.createModel);
router.put("/:id", modelsController.updateModel);
router.delete("/:id", modelsController.deleteModel);

module.exports = router;
