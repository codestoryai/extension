[
  {
    "name": "App.css",
    "description": "/Users/guglielmodanna/Repo/test/devtools/react-starter/src/App.css",
    "content": "```/Users/guglielmodanna/Repo/test/devtools/react-starter/src/App.css\n#root {\n  max-width: 1280px;\n  margin: 0 auto;\n  padding: 2rem;\n  text-align: center;\n}\n\n.logo {\n  height: 6em;\n  padding: 1.5em;\n  will-change: filter;\n  transition: filter 300ms;\n}\n.logo:hover {\n  filter: drop-shadow(0 0 2em #646cffaa);\n}\n.logo.react:hover {\n  filter: drop-shadow(0 0 2em #61dafbaa);\n}\n\n@keyframes logo-spin {\n  from {\n    transform: rotate(0deg);\n  }\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n@media (prefers-reduced-motion: no-preference) {\n  a:nth-of-type(2) .logo {\n    animation: logo-spin infinite 20s linear;\n  }\n}\n\n.card {\n  padding: 2em;\n}\n\n.read-the-docs {\n  color: #888;\n}\n\n```",
    "uri": {
      "type": "file",
      "value": "/Users/guglielmodanna/Repo/test/devtools/react-starter/src/App.css"
    },
    "id": {
      "providerTitle": "file",
      "itemId": "e2d9017e-3de5-4e4e-9f0a-8b2fc0355724"
    }
  },
  {
    "name": "App.jsx",
    "description": "src/App.jsx",
    "content": "```/src/App.jsx\nimport { useState } from \"react\";\nimport reactLogo from \"./assets/react.svg\";\nimport viteLogo from \"/vite.svg\";\nimport \"./App.css\";\n\nfunction App() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <>\n      <div>\n        <a href=\"https://vite.dev\" target=\"_blank\">\n          <img src={viteLogo} className=\"logo\" alt=\"Vite logo\" />\n        </a>\n        <a href=\"https://react.dev\" target=\"_blank\">\n          <img src={reactLogo} className=\"logo react\" alt=\"React logo\" />\n        </a>\n      </div>\n      <h1>Vite + React</h1>\n      <div className=\"card\">\n        <button onClick={() => setCount((count) => count + 1)}>\n          count is {count}\n        </button>\n        <p>\n          Edit <code>src/App.jsx</code> and save to test HMR\n        </p>\n      </div>\n      <p className=\"read-the-docs\">\n        Click on the Vite and React logos to learn more\n      </p>\n    </>\n  );\n}\n\nexport default App;\n\n```",
    "uri": {
      "type": "file",
      "value": "src/App.jsx"
    },
    "id": {
      "providerTitle": "relative-file",
      "itemId": "a15656b1-eb33-4b6d-8f02-35772283a596"
    }
  }
];