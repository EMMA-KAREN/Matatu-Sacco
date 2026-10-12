import os

class Config:
    # This reads 'DATABASE_URL' from cPanel. If it doesn't exist, it uses your local database URI.
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL', 
        "postgresql://emma:1234@localhost:5432/matatu_sacco"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = "uploads"