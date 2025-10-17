FROM python:3.11-slim

WORKDIR /frontend
COPY . .
RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "simple_main.py"]

