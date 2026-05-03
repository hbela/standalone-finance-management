import type { FastifyInstance } from "fastify";
import { initialBanks, type CountryCode } from "@wise-finance/shared";

const supportedCountries = new Set<CountryCode>(["HU", "FR"]);

export async function registerBankRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      country?: string;
    };
  }>("/banks", async (request) => {
    const country = request.query.country?.toUpperCase();

    if (country && supportedCountries.has(country as CountryCode)) {
      return {
        banks: initialBanks.filter((bank) => bank.country === country)
      };
    }

    return {
      banks: initialBanks
    };
  });
}
