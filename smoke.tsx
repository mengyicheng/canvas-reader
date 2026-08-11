import React from "react";
import { renderToString } from "react-dom/server";
import App from "./src/App";
const html = renderToString(React.createElement(App));
console.log("SMOKE_OK length=" + html.length);
