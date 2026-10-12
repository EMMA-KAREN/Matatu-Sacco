import os
import sys

# Add the application path to system paths
sys.path.insert(0, os.path.dirname(__file__))

# Import your Flask app object as 'application'
# Passenger looks for this specific variable
from app import app as application