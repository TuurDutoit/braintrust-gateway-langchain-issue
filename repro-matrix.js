/**
 * Test createAgent tool loop across model + gateway combinations.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-...
 *   BRAINTRUST_API_KEY=...
 *   BRAINTRUST_PROJECT_ID=...
 *
 *   node repro-matrix.js                          # run all combinations
 *   node repro-matrix.js gpt-4o-mini              # one model, both gateways
 *   node repro-matrix.js gpt-5.4 braintrust       # one specific combo
 */
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { createAgent, tool } from "langchain";
import { z } from "zod";

const [modelFilter, gatewayFilter] = process.argv.slice(2);

const models = ["gpt-4o-mini", "gpt-5.4"];
const gateways = {
  direct: () => ({
    apiKey: process.env.OPENAI_API_KEY,
  }),
  braintrust: () => ({
    apiKey: process.env.BRAINTRUST_API_KEY,
    configuration: {
      baseURL: "https://gateway.braintrust.dev/v1",
      defaultHeaders: {
        "x-bt-project-id": process.env.BRAINTRUST_PROJECT_ID,
        "x-bt-use-cache": "never",
      },
    },
  }),
};

const addTool = tool(
  async ({ a, b }) => String(a + b),
  {
    name: "add",
    description: "Add two numbers and return the result.",
    schema: z.object({
      a: z.number().describe("first number"),
      b: z.number().describe("second number"),
    }),
  },
);

async function run(model, gatewayName) {
  const label = `${model} + ${gatewayName}`;
  const config = gateways[gatewayName]();
  if (!config.apiKey) {
    console.log(`  SKIP  ${label} (missing API key)`);
    return;
  }

  const llm = new ChatOpenAI({ ...config, model, temperature: 0 });
  const agent = createAgent({
    model: llm,
    systemPrompt: "You are a calculator. Always use the add tool — do not compute in your head.",
    tools: [addTool],
  });

  try {
    const result = await agent.invoke({
      messages: [
        new HumanMessage(
          "What is 1 + 2 + 3? First call add(1, 2), then call add(result, 3). Do NOT batch — one call at a time."
        ),
      ],
    });

    const last = result.messages.at(-1);
    const ok = last.constructor.name !== "ToolMessage";
    const ids = result.messages
      .filter((m) => m.constructor.name === "AIMessage")
      .map((m) => m.id);
    const uniqueIds = new Set(ids).size;

    console.log(
      `  ${ok ? "✅ PASS" : "❌ FAIL"}  ${label}  (${result.messages.length} msgs, ${ids.length} AI msgs, ${uniqueIds} unique IDs: ${ids.join(", ")})`
    );
  } catch (e) {
    console.log(`  💥 ERR   ${label}  ${e.message.slice(0, 100)}`);
  }
}

console.log("createAgent tool loop test matrix\n");

for (const model of models) {
  if (modelFilter && model !== modelFilter) continue;
  for (const gw of Object.keys(gateways)) {
    if (gatewayFilter && gw !== gatewayFilter) continue;
    await run(model, gw);
  }
}
