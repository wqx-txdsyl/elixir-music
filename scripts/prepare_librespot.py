"""Fetch the pinned go-librespot sidecar used for real in-app Spotify playback.

Downloads the official release executable plus the MinGW decode libraries it
dynamically links (libFLAC, libogg, libvorbis, libmpg123) and verifies every
artifact against a pinned SHA-256 before extraction. Run once per machine;
build_desktop copies the result into resources/backend/librespot.
"""
from pathlib import Path
import hashlib
import requests
import tarfile
import zstandard

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'.cache'/'librespot'
RUNTIME=BASE/'runtime'

GO_LIBRESPOT_VERSION='v0.10.5'
GO_LIBRESPOT_SHA256='5f5a28df9fca9cd6545ec4344d750d55167f15537370ce8cc3bc7c087f571d07'
GO_LIBRESPOT_URL='https://github.com/devgianlu/go-librespot/releases/download/v0.10.5/go-librespot_windows_amd64.tar.gz'

# MSYS2 packages providing the decode DLLs the release binary imports.
MSYS2_PACKAGES={
    'mingw-w64-x86_64-flac-1.5.0-2-any.pkg.tar.zst':'cf1713c63bd34a6ca24b231bee194c6ac319dcefa4cd41bb9fbb44c941bc6870',
    'mingw-w64-x86_64-libogg-1.3.6-1-any.pkg.tar.zst':'7ef9ec16403e1489a37c3a5ce58b083408ba694c6882e673639e2250df98bb8b',
    'mingw-w64-x86_64-libvorbis-1.3.7-3-any.pkg.tar.zst':'3d68dc3ccb32f0ea230a4bbc19c8fd440893058437c49864c4e26b12d6cb078a',
    'mingw-w64-x86_64-mpg123-1.33.7-1-any.pkg.tar.zst':'2928cf82017d27d394f383abadbae3137e3c0123a0c635b81f8192b62b8c1745',
}
MSYS2_BASE='https://repo.msys2.org/mingw/mingw64/'

REQUIRED_FILES=['go-librespot.exe','libFLAC.dll','libogg-0.dll','libvorbis-0.dll','libvorbisenc-2.dll','libmpg123-0.dll']


def sha256(path:Path)->str:
    digest=hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda:handle.read(1024*1024),b''):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(url:str,target:Path,expected:str)->None:
    if target.exists() and sha256(target)==expected:
        return
    with requests.get(url,stream=True,timeout=60) as response:
        response.raise_for_status()
        with target.open('wb') as output:
            for chunk in response.iter_content(1024*1024):
                output.write(chunk)
    if sha256(target)!=expected:
        raise RuntimeError(f'Checksum mismatch for {target.name}')


def extract_tar_zst(archive:Path,destination:Path,names:dict)->None:
    with archive.open('rb') as raw:
        with zstandard.ZstdDecompressor().stream_reader(raw) as stream:
            with tarfile.open(fileobj=stream,mode='r|') as tar:
                for member in tar:
                    name=member.name.rsplit('/',1)[-1]
                    if name in names:
                        target=(destination/name).resolve()
                        if not target.is_relative_to(destination.resolve()):
                            raise RuntimeError('Invalid archive member')
                        with tar.extractfile(member) as source:
                            target.write_bytes(source.read())


def prepare()->Path:
    downloads=BASE/'dl'
    downloads.mkdir(parents=True,exist_ok=True)
    RUNTIME.mkdir(parents=True,exist_ok=True)

    go_archive=downloads/'go-librespot_windows_amd64.tar.gz'
    fetch(GO_LIBRESPOT_URL,go_archive,GO_LIBRESPOT_SHA256)
    with tarfile.open(go_archive) as tar:
        for member in tar:
            name=member.name.rsplit('/',1)[-1]
            if name=='go-librespot.exe':
                target=(RUNTIME/name)
                with tar.extractfile(member) as source:
                    target.write_bytes(source.read())

    for package,checksum in MSYS2_PACKAGES.items():
        archive=downloads/package
        fetch(MSYS2_BASE+package,archive,checksum)
        extract_tar_zst(archive,RUNTIME,{name for name in REQUIRED_FILES if name.endswith('.dll')})

    missing=[name for name in REQUIRED_FILES if not (RUNTIME/name).exists()]
    if missing:
        raise RuntimeError(f'Missing sidecar files: {missing}')
    print(f'Verified go-librespot {GO_LIBRESPOT_VERSION}: {RUNTIME}')
    return RUNTIME


if __name__=='__main__':
    prepare()
