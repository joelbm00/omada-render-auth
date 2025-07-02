const express = require("express");
const fetch = require("node-fetch");
const https = require("https");
const cors = require("cors");
const dns = require("dns");

const app = express();
const port = process.env.PORT || 3000;

// Configuración del controlador OC200
const CONTROLLER = "b1a4-190-34-133-54.ngrok-free.app";
const CONTROLLER_PORT = 443;
const CONTROLLER_ID = "6657e53f19e72732099b4edd5ab1105b";
const OPERATOR_USER = "guest-portal";
const OPERATOR_PASS = "Tplink!2027";

// Middleware
app.use(express.json());
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.options("*", cors());

// Función auxiliar para timeout
const fetchConTimeout = async (url, options, timeoutMs = 10000) => {
  const controller
