import { Controller, Get } from "@nestjs/common";
import { getPublicCommuneContacts } from "../../prisma/verified-neighbor-contact";

@Controller("public/commune-contacts")
export class CommuneContactController {
  @Get()
  list() {
    return getPublicCommuneContacts();
  }
}
