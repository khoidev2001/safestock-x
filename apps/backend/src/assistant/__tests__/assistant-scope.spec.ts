import { ForbiddenException } from "@nestjs/common";
import { AssistantController } from "../assistant.controller";
import { AuthenticatedRequest } from "../../auth/authenticated-request";

/**
 * Gap A (IDOR): AssistantController.ask trả snapshot JSON kho cho LLM. Trưởng thôn
 * (warehouseId có giá trị) chỉ được hỏi kho mình; hỏi kho khác → 403 TRƯỚC khi
 * chạm service (không rò rỉ dữ liệu kho khác). User toàn xã (null) hỏi mọi kho.
 */
describe("AssistantController — chống IDOR theo scope kho (gap A)", () => {
  function makeController() {
    const assistant = { ask: jest.fn().mockResolvedValue({ answer: "ok" }) };
    const controller = new AssistantController(assistant as never);
    return { controller, assistant };
  }

  const req = (warehouseId: string | null): AuthenticatedRequest =>
    ({ user: { userId: "u1", warehouseId } }) as never;

  const dto = { question: "Kho còn gạo không?" };

  it("trưởng thôn A hỏi kho B → 403, KHÔNG gọi service", () => {
    const { controller, assistant } = makeController();
    expect(() => controller.ask(req("kho-A"), "kho-B", dto)).toThrow(ForbiddenException);
    expect(assistant.ask).not.toHaveBeenCalled();
  });

  it("trưởng thôn A hỏi đúng kho A → cho qua, delegate service", () => {
    const { controller, assistant } = makeController();
    controller.ask(req("kho-A"), "kho-A", dto);
    expect(assistant.ask).toHaveBeenCalledWith("kho-A", dto.question);
  });

  it("user toàn xã (scope null) hỏi mọi kho → cho qua", () => {
    const { controller, assistant } = makeController();
    controller.ask(req(null), "kho-B", dto);
    expect(assistant.ask).toHaveBeenCalledWith("kho-B", dto.question);
  });
});
