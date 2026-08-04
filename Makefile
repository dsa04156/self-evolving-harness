.PHONY: install-local install-debug

install-local:
	./scripts/install-seh.sh

install-debug:
	./scripts/install-seh.sh --debug
