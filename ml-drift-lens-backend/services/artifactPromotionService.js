const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");

function pythonExecutable() {
  const venvPython = path.join(projectRoot, ".venv-1", "Scripts", "python.exe");
  return process.env.PYTHON_EXECUTABLE || (fs.existsSync(venvPython) ? venvPython : "python");
}

function invoke(action, details = {}, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(pythonExecutable(), ["-m", "ml.model.artifact_promotion"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: [projectRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        return reject(new Error(stderr.trim() || `Artifact promotion ${action} failed`));
      }
      try {
        resolve(JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)));
      } catch (error) {
        reject(new Error(`Invalid artifact promotion response: ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify({ action, ...details }));
  });
}

module.exports = {
  promoteCandidate: (modelId, modelVersion) => invoke("promote", { model_id: modelId, model_version: modelVersion }),
  rollback: (backupToken) => invoke("rollback", { backup_token: backupToken }),
  finalize: (backupToken) => invoke("finalize", { backup_token: backupToken }),
};