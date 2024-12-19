#!/bin/bash

# Add Ubuntu 22.04 (Jammy) repository for libssl3
echo "deb http://archive.ubuntu.com/ubuntu jammy main" | sudo tee /etc/apt/sources.list.d/jammy.list

# Update package lists
sudo apt-get update

# Install libssl3 and other required dependencies
sudo apt-get install -y libssl3

# Install Python 3.9 or newer if not present
if ! command -v python3 >/dev/null 2>&1 || [ $(python3 -c 'import sys; print(sys.version_info >= (3, 9))') = 'False' ]; then
    echo "Installing Python 3.9 or newer..."
    sudo apt-get install -y python3.9 python3-pip
fi

# Upgrade pip to latest version
python3 -m pip install --upgrade pip

# Install pydantic dependencies
pip install -U pydantic
pip install pydantic-ai
pip install pydantic-ai[logfire]

# Clean up - remove the temporary source list
sudo rm /etc/apt/sources.list.d/jammy.list
sudo apt-get update

echo "Codespace dependencies installed successfully!"