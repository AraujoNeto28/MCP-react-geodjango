FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Container timezone (affects logs and localtime)
ENV TZ=America/Sao_Paulo

# Install system dependencies
# binutils, libproj-dev, gdal-bin are explicitly requested for GeoDjango
# We also need python3 and build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    binutils \
    libproj-dev \
    gdal-bin \
    libgdal-dev \
    python3-dev \
    build-essential \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Apply timezone
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Create a virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy project
COPY . .

# Entrypoint (run migrations before starting dev server)
RUN chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3001

# Run the application
CMD ["/app/entrypoint.sh"]
