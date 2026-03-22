import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    
    JWT_SECRET_KEY         ="d845c42e5a7bab1f0fbd2b67e6dd4169"
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours in seconds

    # MySQL  (flask-mysqldb keys)
    MYSQL_HOST     = os.getenv("MYSQL_HOST", "localhost")
    MYSQL_USER     = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "ASt14@20")
    MYSQL_DB       = os.getenv("MYSQL_DB", "smart_expense_manager")
    MYSQL_CURSORCLASS = "DictCursor"   # rows come back as dicts, not tuples