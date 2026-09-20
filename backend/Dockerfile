FROM python:3.11-slim
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV DEEPFACE_HOME=/app TF_ENABLE_ONEDNN_OPTS=0
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python -c "from deepface import DeepFace; DeepFace.build_model(model_name='Facenet')"
RUN chmod -R 777 /app
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
