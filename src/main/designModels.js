// Pinned MIT-licensed weights for background removal. Downloaded only when the user asks
// (Settings → AI or the prompt in Design), checked with SHA-256, and never packed into the installer.
module.exports = {
  "id": "jiabins0303/birefnet-lite-1024-webgpu",
  "fallback": "studioludens/birefnet-lite-512",
  "models": [
    {
      "id": "jiabins0303/birefnet-lite-1024-webgpu",
      "revision": "1ad01cef0f4101a285c5a3e0bd7f15597d93403f",
      "license": "MIT",
      "files": [
        {
          "file": "config.json",
          "sha256": "50acd2d700ee3d5facdcf3aab2312bb586372726dce8bdd5741bdae0ca6eb84f",
          "url": "https://huggingface.co/jiabins0303/birefnet-lite-1024-webgpu/resolve/1ad01cef0f4101a285c5a3e0bd7f15597d93403f/config.json",
          "size": 81
        },
        {
          "file": "preprocessor_config.json",
          "sha256": "447d9ccb2c4129ab0ca045fc293e7d79dbc45e293ac1e94818d865db77f65a54",
          "url": "https://huggingface.co/jiabins0303/birefnet-lite-1024-webgpu/resolve/1ad01cef0f4101a285c5a3e0bd7f15597d93403f/preprocessor_config.json",
          "size": 391
        },
        {
          "file": "onnx/model_fp16.onnx",
          "sha256": "4059896039dfccb0f15b9080ff06d11d90e499449bb045e797055eb8901cf5f4",
          "url": "https://huggingface.co/jiabins0303/birefnet-lite-1024-webgpu/resolve/1ad01cef0f4101a285c5a3e0bd7f15597d93403f/onnx/model_fp16.onnx",
          "size": 114834127
        },
        {
          "file": "README.md",
          "sha256": "ba895644ce78d5c08e447590769f8cb88750ee43c8dbcd025185bd48742eed74",
          "url": "https://huggingface.co/jiabins0303/birefnet-lite-1024-webgpu/resolve/1ad01cef0f4101a285c5a3e0bd7f15597d93403f/README.md",
          "size": 8739
        },
        {
          "file": "LICENSE.txt",
          "sha256": "92a7089e0915fc32bc40067560b398f1e6a7a5958abd7d04eda393629a5acefb",
          "url": "https://raw.githubusercontent.com/ZhengPeng7/BiRefNet/main/LICENSE",
          "size": 1066
        }
      ],
      "label": "Fast (GPU)",
      "description": "Sharper edges at 1024 pixels. Needs a graphics card with WebGPU.",
      "gpu": true,
      "sizeBytes": 114844404,
      "licenseText": "assets/licenses/jiabins0303-birefnet-lite-1024-webgpu-LICENSE.txt"
    },
    {
      "id": "studioludens/birefnet-lite-512",
      "revision": "962e67969ec6acec9c19fab76acee4f5e22e990c",
      "license": "MIT",
      "files": [
        {
          "file": "config.json",
          "sha256": "561965f7aa366c48b95ab1c24220d59a718df4025c2ecb359dd5736ceb49e912",
          "url": "https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/config.json",
          "size": 81
        },
        {
          "file": "preprocessor_config.json",
          "sha256": "a79663b311d8404dfb329f7b45bc9f970a0c155aeedae8ac15b6b77d76789613",
          "url": "https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/preprocessor_config.json",
          "size": 389
        },
        {
          "file": "onnx/model.onnx",
          "sha256": "1cb0fb360dadd15af77c639085d77a9df67db0c64315560c3de005f676345ac2",
          "url": "https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/onnx/model.onnx",
          "size": 191877254
        },
        {
          "file": "README.md",
          "sha256": "8e4338e9e368804ae5b6fc5b7e634e405f84c7879c405f738904f47b368399cf",
          "url": "https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/README.md",
          "size": 9089
        },
        {
          "file": "LICENSE",
          "sha256": "b5cd5faac84a0acb8a6bdb8aeef0919e528891be27216df84eab398d7c8bd2aa",
          "url": "https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/LICENSE",
          "size": 1106
        }
      ],
      "label": "Standard (any computer)",
      "description": "Works on every computer, on the processor. Softer edges.",
      "gpu": false,
      "sizeBytes": 191887919,
      "licenseText": "assets/licenses/studioludens-birefnet-lite-512-LICENSE.txt"
    }
  ]
};
