# extensions.py  –  initialise extensions here, import them everywhere else
from flask_mysqldb import MySQL
from flask_jwt_extended import JWTManager

mysql = MySQL()
jwt   = JWTManager()