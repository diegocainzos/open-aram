import { defineRoom, defineServer, matchMaker } from "colyseus";
import express from "express";
import { GameRoom } from "./GameRoom";

const server = defineServer({
  rooms: { aram: defineRoom(GameRoom) },
  express: app => {
    app.use((_req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); next(); });
    app.use(express.static("dist")); // built client, so one port/tunnel serves everything
    app.get("/rooms", async (_req, res) => {
      const rooms = await matchMaker.query({ name: "aram" });
      res.json(rooms.map((r: any) => ({ roomId: r.roomId, clients: r.clients, maxClients: r.maxClients, ...r.metadata })));
    });
  },
});

server.listen(Number(process.env.PORT) || 2567);
