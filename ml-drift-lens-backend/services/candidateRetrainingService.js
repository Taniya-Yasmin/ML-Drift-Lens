const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "../..");

function defaultPythonExecutable() {
  const virtualEnvironmentPython = path.join(
    projectRoot,
    ".venv-1",
    "Scripts",
    "python.exe",
  );
  return fs.existsSync(virtualEnvironmentPython) ? virtualEnvironmentPython : "python";
}

function runCandidateRetraining(records, options = {}, spawnProcess = spawn) {
  const modelId = options.modelId;
  const contractPath = options.contractPath || path.join(projectRoot, "ml", "contracts", "nsl_kdd_data_contract.json");
  const candidateDir = options.candidateDir || path.join(projectRoot, "ml", "artifacts", "candidates");
  const pythonExecutable = options.pythonExecutable || process.env.PYTHON_EXECUTABLE || defaultPythonExecutable();
  const args = [
    "-m",
    "ml.retraining",
    "--contract",
    contractPath,
    "--candidate-dir",
    candidateDir,
    "--model-id",
    modelId,
    "--min-samples",
    String(options.minSamples ?? 30),
  ];

  if (options.oldModelVersion) {
    args.push("--old-model-version", options.oldModelVersion);
  }

  return new Promise((resolve, reject) => {
    const child = spawnProcess(pythonExecutable, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: [projectRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        return reject(new Error(stderr.trim() || `Candidate retraining exited with code ${exitCode}`));
      }

      try {
        const outputLines = stdout.trim().split(/\r?\n/).filter(Boolean);
        resolve(JSON.parse(outputLines[outputLines.length - 1]));
      } catch (error) {
        reject(new Error(`Invalid candidate retraining output: ${error.message}`));
      }
    });

    child.stdin.end(JSON.stringify(records));
  });
}

module.exports = {
  projectRoot,
  runCandidateRetraining,
};