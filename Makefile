.DEFAULT_GOAL := help
SHELL := /bin/bash

#------------------Dev Commands------------------#
run-agent:
	@echo "Running agent locally..."
	echo "\nCleaning up Python cache..."; \
	find . -type d \( -name ".pytest_cache" -o -name "__pycache__" \) -exec rm -rvf {} +
# 	cd agent && \
# 	set -a && source .env && set +a && \
# 	cd src && uvicorn main:app --host 0.0.0.0 --port 8000; \
	
	bash -c 'cd agent && [ -f .env ] && set -a && . .env && set +a; cd src && uvicorn main:app --host 0.0.0.0 --port 8000'
	_temp=$?; \

run-unit-test-agent:
	@echo "Running agent locally..."
	cd agent && PYTHONPATH=src \
	pytest --cache-clear

run-app:
	@echo "Running agent locally..."
	cd apps && \
	npm run dev

clean-up-python-cache:
	@echo "Cleaning up Python cache..."
	find . -type d \( -name ".pytest_cache" -o -name "__pycache__" \) -exec rm -rvf {} +

help:
	@echo "Makefile commands:"
	@echo "\t make run-api-local\t\t- Run the API locally"