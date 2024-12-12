#!/bin/bash

# Add Ubuntu 22.04 (Jammy) repository for libssl3
echo "deb http://archive.ubuntu.com/ubuntu jammy main" | sudo tee /etc/apt/sources.list.d/jammy.list

# Update package lists
sudo apt-get update

# Install libssl3 and other required dependencies
sudo apt-get install -y libssl3

# Clean up - remove the temporary source list
sudo rm /etc/apt/sources.list.d/jammy.list
sudo apt-get update

echo "Codespace dependencies installed successfully!"