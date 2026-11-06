"""Sign the prepared desktop package using the builder's EVS credentials."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / '.cache' / 'evs-tools'))

from castlabs_evs.vmp import VMP


def main():
    package = (ROOT / 'release' / 'elixir-candidate' / 'win-unpacked').resolve()
    if not package.is_relative_to((ROOT / 'release').resolve()) or not (package / 'Elixir.exe').is_file():
        raise RuntimeError('Prepared desktop package not found')

    signing_directory = os.environ.get('ELIXIR_SIGNING_DIR')
    if signing_directory:
        from backend.store import protect
        private = Path(signing_directory).resolve()
        credentials = json.loads(protect((private / 'evs-account.dpapi').read_text(encoding='ascii'), True))
        config_path = private / 'evs-config.dpapi'

        class ProtectedVMP(VMP):
            def _load_config(self):
                self._Auth__config = json.loads(protect(config_path.read_text(encoding='ascii'), True)) if config_path.exists() else {}
                self._on_load_config(self._Auth__config)

            def _store_config(self):
                value = self._on_store_config(getattr(self, '_Auth__config', {}))
                config_path.write_text(protect(json.dumps(value)), encoding='ascii')
                return True

        client = ProtectedVMP(no_ask=True)
        account, password = credentials['account_name'], credentials['password']
    else:
        account, password = os.environ.get('ELIXIR_EVS_ACCOUNT'), os.environ.get('ELIXIR_EVS_PASSWORD')
        if not account or not password:
            raise RuntimeError('Configure EVS credentials or ELIXIR_SIGNING_DIR before production signing')
        client = VMP(no_ask=True)

    client.sign_pkg([str(package)], name_hint='Elixir', account_name=account, passwd=password)
    client.verify_pkg([str(package)], name_hint='Elixir')
    print(json.dumps({'production_signature_verified': True}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Service exception text can contain account details.
        print(json.dumps({'failed': True, 'type': type(error).__name__}))
        sys.exit(1)
