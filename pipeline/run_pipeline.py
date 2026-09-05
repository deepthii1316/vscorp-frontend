import os
import sys

# Ensure scripts folder is on sys.path
pipeline_dir = os.path.dirname(os.path.abspath(__file__))
scripts_dir = os.path.join(pipeline_dir, "scripts")
for p in [pipeline_dir, scripts_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)

from scripts.run_pipeline import run_pipeline

if __name__ == "__main__":
    run_pipeline()
