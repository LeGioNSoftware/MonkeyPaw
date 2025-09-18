FROM python:3.12-slim
WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir -r requirements.txt
ENV DATABASE_URL=${DATABASE_URL}
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]