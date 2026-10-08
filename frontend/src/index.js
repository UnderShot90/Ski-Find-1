import React from "react";
import ReactDOM from "react-dom";
import './index.css'
import App from "./App";
import 'bootstrap/dist/css/bootstrap.min.css';
import './site.css';

import { BrowserRouter } from "react-router-dom";
// Test Change

ReactDOM.render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  document.getElementById("root")
);
