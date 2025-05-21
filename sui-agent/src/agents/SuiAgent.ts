import { IntentAgentResponse } from '../@types/interface';
import Tools from '../utils/tools';
import { registerAllTools } from './ToolRegistry';
import Utils from '../utils';
import intent_agent_prompt from '../prompts/tool_selector';
import final_answer_agent_prompt from '../prompts/final_answer_agent';
import Atoma from '../config/atoma';
import decomposerPrompt from '../prompts/decomposer';

/**
 * Main agent class that handles intent processing and decision making.
 * Coordinates between different agent types to process user queries.
 * This is the primary entry point for all agent-based operations.
 *
 * The agent follows a pipeline architecture:
 * 1. Query Decomposition - Breaks down complex queries into simpler subqueries
 * 2. Tool Selection - Identifies appropriate tools for each subquery
 * 3. Query Processing - Executes tools and aggregates results
 *
 * TODO:
 * - Implement retry mechanisms for failed tool executions
 * - Add context management to maintain conversation history
 * - Implement caching for frequently used tool results
 * - Add error recovery strategies for each pipeline stage
 * - Implement rate limiting for API calls
 * - Add validation for tool arguments before execution
 *
 * @example
 * const agent = new Agents("your-bearer-auth-token", "optional-model-name", "your-private-key");
 * const response = await agent.processUserQueryPipeline("What is the current price of the Sui token?");
 * console.log(response);
 */
class Agents {
  private tools: Tools;
  private utils: Utils;
  private AtomaClass: Atoma;
  private privateKey?: string;

  /**
   * Creates a new instance of the Agents class.
   * Initializes all necessary components and registers available tools.
   *
   * @param bearerAuth - Authentication token for API access
   * @param modelName - Optional model name to use (e.g., "mistral/mistral-nemo-instruct-2407")
   * @param privateKey - Optional private key for signing blockchain transactions
   * 
   * TODO: Add support for additional configuration options
   */
  constructor(bearerAuth: string, modelName?: string, privateKey?: string) {
    this.tools = new Tools(bearerAuth, intent_agent_prompt);
    this.AtomaClass = new Atoma(bearerAuth, modelName);
    this.utils = new Utils(bearerAuth, final_answer_agent_prompt, this.tools);
    this.privateKey = privateKey;
    
    // Register tools when agent is instantiated
    registerAllTools(this.tools);
  }

  /**
   * Gets the private key used for signing transactions.
   * 
   * @returns The stored private key or undefined if not set
   */
  getPrivateKey(): string | undefined {
    return this.privateKey;
  }

  /**
   * Sets the private key for signing transactions.
   * 
   * @param privateKey - The private key to set
   */
  setPrivateKey(privateKey: string): void {
    this.privateKey = privateKey;
  }

  /**
   * Decomposes a complex user query into simpler subqueries that can be processed independently.
   * Uses the Atoma LLM to break down queries based on the decomposer prompt.
   *
   * @param prompt - The original user query to decompose
   * @returns Promise containing array of decomposed subqueries
   */
  async QueryDecomposer(prompt: string) {
    return await this.AtomaClass.atomaChat([
      { content: decomposerPrompt, role: 'assistant' },
      { content: prompt, role: 'user' },
    ]);
  }

  /**
   * Analyzes decomposed subqueries and selects appropriate tools for processing each one.
   * Maps each subquery to one or more tools that can handle it.
   *
   * @param subqueries - Array of decomposed subqueries
   * @param address - Optional wallet address for context
   * @returns Promise containing tool selection responses for each subquery
   */
  async toolsSelector(subqueries: string[], address?: string) {
    const IntentResponse: IntentAgentResponse[] =
      (await this.tools.selectAppropriateTool(
        this.AtomaClass,
        `${subqueries}`,
        address,
      )) as IntentAgentResponse[];

    return IntentResponse;
  }

  /**
   * Processes the selected tools' responses and generates a final answer.
   * Coordinates execution of tools and aggregates their results.
   *
   * @param intentResponse - Array of tool selection responses
   * @param query - Original user query for context
   * @returns Promise containing processed final response
   *
   * TODO:
   * - Add support for parallel tool execution
   */
  async QueryProcessor(intentResponse: IntentAgentResponse[], query: string) {
    return await this.utils.processQuery(
      this.AtomaClass,
      query,
      intentResponse,
      this.privateKey
    );
  }

  /**
   * Main pipeline for processing user queries from start to finish.
   * Orchestrates the entire process from query decomposition to final response.
   *
   * Pipeline stages:
   * 1. Query decomposition
   * 2. Tool selection for each subquery
   * 3. Tool execution and response processing
   * 4. Final answer generation
   *
   * @param prompt - User's input query
   * @param walletAddress - Optional wallet address for context
   * @returns Promise containing final processed response
   */
  async processUserQueryPipeline(prompt: string, walletAddress?: string) {
    // Process intent
    const decomposer = await this.QueryDecomposer(prompt);
    const decomposed: string[] = JSON.parse(
      decomposer.choices[0].message.content,
    );
    console.log(decomposed);
    const res = await this.toolsSelector(decomposed, walletAddress);
    console.log(res, 'this is intent agent response');
    // Make decision based on intent
    const finalAnswer = await this.QueryProcessor(res, prompt);
    console.log('Final Answer:', finalAnswer);
    return finalAnswer;
  }
}

export default Agents;
