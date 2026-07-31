import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { SimulationController } from "../simulation.controller";

describe("SimulationController route contract", () => {
  it("chỉ công khai API cảm biến trực tiếp, không còn scenario hoặc run", () => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, SimulationController) as string;
    const prototype = SimulationController.prototype as unknown as Record<string, unknown>;

    const routes = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== "constructor")
      .flatMap((name) => {
        const handler = prototype[name];
        if (typeof handler !== "function") return [];

        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (path == null || method == null) return [];

        const paths = Array.isArray(path) ? path : [path];
        return paths.map(
          (routePath) =>
            `${RequestMethod[method]} /${[controllerPath, routePath].filter(Boolean).join("/")}`,
        );
      })
      .sort();

    expect(routes).toEqual(
      [
        "GET /simulator/first-warehouse",
        "GET /simulator/warehouses/:id/devices",
        "GET /simulator/warehouses/:id/timeline",
        "GET /simulator/warehouses/:id/alarm-policy",
        "POST /simulator/alarm-acks",
        "POST /simulator/snapshots",
      ].sort(),
    );
  });
});
