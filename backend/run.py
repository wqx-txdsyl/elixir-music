"""Entrypoint shared by development and the frozen desktop service."""
import multiprocessing
import os
import sys
from pathlib import Path

if not getattr(sys,'frozen',False):
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

if __name__=='__main__':
    multiprocessing.freeze_support()
    import uvicorn
    from backend.app import app
    uvicorn.run(app,host='127.0.0.1',port=int(os.environ.get('MUSICPLATFORM_PORT','18740')),access_log=False,log_level='warning')
