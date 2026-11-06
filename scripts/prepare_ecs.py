"""Fetch the pinned official ECS runtime used by Elixir's in-process Spotify audio."""
from pathlib import Path
import hashlib
import requests
import zipfile

ROOT=Path(__file__).resolve().parents[1]
VERSION='44.1.0+wvcus'
SHA256='1eb1ce84dfe387052123578a595578bd48a489bb6d1278f1c45ef8f0ceea5f36'
BASE=ROOT/'.cache'/'ecs-44.1.0'
ARCHIVE=BASE/f'electron-v{VERSION}-win32-x64.zip'
URL='https://github.com/castlabs/electron-releases/releases/download/v44.1.0%2Bwvcus/electron-v44.1.0%2Bwvcus-win32-x64.zip'

def prepare():
    BASE.mkdir(parents=True,exist_ok=True)
    if not ARCHIVE.exists() or hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()!=SHA256:
        with requests.get(URL,stream=True,timeout=45) as response:
            response.raise_for_status()
            with ARCHIVE.open('wb') as output:
                for chunk in response.iter_content(1024*1024):output.write(chunk)
    if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()!=SHA256:raise RuntimeError('ECS runtime checksum mismatch')
    destination=BASE/'runtime'
    with zipfile.ZipFile(ARCHIVE) as archive:
        for member in archive.infolist():
            target=(destination/member.filename).resolve()
            if not target.is_relative_to(destination.resolve()):raise RuntimeError('Invalid archive member')
        archive.extractall(destination)
    print(f'Verified ECS {VERSION}: {destination}')

if __name__=='__main__':prepare()
