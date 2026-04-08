# SelenePy
A JupyterLab extension to support AI-assisted generation of Juypter notebooks.


## Available Features:
- Word and Cell count of current notebook
- Suggestions Panel which asynchronously reports suggestions based on the current cell
- Multi-agent Chat system with research and edit capabilities
- Productivity Dashboard that tracks time spent and usage of other features in the notebook
- Context Menu Snippets that can be used to quickly generate code or explanations

## Quickstart
To run locally within this repository:

1. pip install --editable ".[dev,test]"
2. pip uninstall -y pycrdt datalayer_pycrdt
3. pip install datalayer_pycrdt==0.12.17
4. jupyter server extension enable selenepy
5. jupyter labextension develop . --overwrite
6. jlpm run build
9. jupyter lab --port 8888 --IdentityProvider.token MY_TOKEN


To download and run the extension package in your own repository:

1. pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ selenepy
2. pip install jupyterlab==4.4.1 jupyter-collaboration==4.0.2 jupyter-mcp-tools>=0.1.4 ipykernel
3. pip uninstall -y pycrdt datalayer_pycrdt
4. pip install datalayer_pycrdt==0.12.17
5. jupyter lab --port 8888 --IdentityProvider.token MY_TOKEN


##  Use
- Configure your OpenAI API Key in the settings in the frontend. 
- The panels are available on the left sidebar for use.
