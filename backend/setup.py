#!/usr/bin/env python3
"""
Setup configuration for the Clera backend package
"""

from setuptools import setup, find_packages

setup(
    name="clera-backend",
    version="1.0.0",
    description="Clera Backend",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        # Dependencies will be read from requirements.txt
    ],
    extras_require={
        "test": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.21.0",
            "pytest-mock>=3.10.0",
        ],
    },
) 