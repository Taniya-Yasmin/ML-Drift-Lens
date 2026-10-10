FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PATH="/opt/pyvenv/bin:$PATH"
WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 python3-venv libgomp1 \
	&& python3 -m venv /opt/pyvenv \
	&& rm -rf /var/lib/apt/lists/*

COPY ml/inference-requirements.txt /tmp/inference-requirements.txt
RUN pip install --no-cache-dir -r /tmp/inference-requirements.txt \
	&& rm /tmp/inference-requirements.txt

RUN pip install --no-cache-dir "SQLAlchemy==2.0.52" "mlflow==2.22.5"

COPY ml-drift-lens-backend/package*.json ./
RUN npm ci --omit=dev

COPY ml ./ml
COPY ml-drift-lens-backend ./ml-drift-lens-backend

RUN mkdir -p /app/ml/artifacts/candidates /app/ml/artifacts/.promotion-backups \
	&& chown 1000:1000 /app/ml/artifacts /app/ml/artifacts/candidates /app/ml/artifacts/.promotion-backups

EXPOSE 3000
CMD ["node", "ml-drift-lens-backend/server.js"]
