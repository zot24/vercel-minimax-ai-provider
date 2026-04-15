"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createMinimax: () => createMinimaxAnthropic,
  createMinimaxOpenAI: () => createMinimax,
  minimax: () => minimaxAnthropic,
  minimaxAnthropic: () => minimaxAnthropic,
  minimaxOpenAI: () => minimaxOpenAI
});
module.exports = __toCommonJS(index_exports);

// src/minimax-anthropic-provider.ts
var import_internal = require("@ai-sdk/anthropic/internal");
var import_provider = require("@ai-sdk/provider");
var import_provider_utils = require("@ai-sdk/provider-utils");
function createMinimaxAnthropic(options = {}) {
  const baseURL = (0, import_provider_utils.withoutTrailingSlash)(
    options.baseURL ?? "https://api.minimax.io/anthropic/v1"
  );
  const getHeaders = () => (0, import_provider_utils.withUserAgentSuffix)(
    {
      "anthropic-version": "2023-06-01",
      "x-api-key": (0, import_provider_utils.loadApiKey)({
        apiKey: options.apiKey,
        environmentVariableName: "MINIMAX_API_KEY",
        description: "MiniMax API key"
      }),
      ...options.headers
    },
    `minimax-ai-provider`
  );
  const createLanguageModel = (modelId) => {
    return new import_internal.AnthropicMessagesLanguageModel(modelId, {
      provider: "minimax.messages",
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: import_provider_utils.generateId,
      supportedUrls: () => ({
        "image/*": [/^https?:\/\/.*$/]
      })
    });
  };
  const provider = (modelId) => createLanguageModel(modelId);
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.specificationVersion = "v3";
  provider.embeddingModel = (modelId) => {
    throw new import_provider.NoSuchModelError({ modelId, modelType: "embeddingModel" });
  };
  provider.imageModel = (modelId) => {
    throw new import_provider.NoSuchModelError({ modelId, modelType: "imageModel" });
  };
  return provider;
}
var minimaxAnthropic = createMinimaxAnthropic();

// src/minimax-openai-provider.ts
var import_provider5 = require("@ai-sdk/provider");
var import_provider_utils4 = require("@ai-sdk/provider-utils");

// src/minimax-openai-language-model.ts
var import_provider4 = require("@ai-sdk/provider");
var import_provider_utils3 = require("@ai-sdk/provider-utils");
var import_v42 = require("zod/v4");

// src/convert-to-minimax-chat-messages.ts
var import_provider2 = require("@ai-sdk/provider");
var import_provider_utils2 = require("@ai-sdk/provider-utils");
function getOpenAIMetadata(message) {
  return message?.providerOptions?.openaiCompatible ?? {};
}
function getMinimaxMetadata(message) {
  return message?.providerOptions?.minimax ?? {};
}
function convertToMinimaxChatMessages(prompt) {
  const messages = [];
  for (const { role, content, ...message } of prompt) {
    const metadata = getOpenAIMetadata({ ...message });
    switch (role) {
      case "system": {
        messages.push({ role: "system", content, ...metadata });
        break;
      }
      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({
            role: "user",
            content: content[0].text,
            ...getOpenAIMetadata(content[0])
          });
          break;
        }
        messages.push({
          role: "user",
          content: content.map((part) => {
            const partMetadata = getOpenAIMetadata(part);
            switch (part.type) {
              case "text": {
                return { type: "text", text: part.text, ...partMetadata };
              }
              case "file": {
                if (part.mediaType.startsWith("image/")) {
                  const mediaType = part.mediaType === "image/*" ? "image/jpeg" : part.mediaType;
                  return {
                    type: "image_url",
                    image_url: {
                      url: part.data instanceof URL ? part.data.toString() : `data:${mediaType};base64,${(0, import_provider_utils2.convertToBase64)(part.data)}`
                    },
                    ...partMetadata
                  };
                } else {
                  throw new import_provider2.UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`
                  });
                }
              }
            }
          }),
          ...metadata
        });
        break;
      }
      case "assistant": {
        let text = "";
        const toolCalls = [];
        let reasoningDetails = void 0;
        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part);
          const partMinimaxMetadata = getMinimaxMetadata(part);
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input)
                },
                ...partMetadata
              });
              break;
            }
            case "reasoning": {
              if (partMinimaxMetadata?.reasoningDetails) {
                reasoningDetails = partMinimaxMetadata.reasoningDetails;
              }
              break;
            }
          }
        }
        const messageObj = {
          role: "assistant",
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : void 0,
          ...metadata
        };
        if (reasoningDetails) {
          messageObj.reasoning_details = reasoningDetails;
        }
        messages.push(messageObj);
        break;
      }
      case "tool": {
        for (const toolResponse of content) {
          if (toolResponse.type === "tool-approval-response") {
            continue;
          }
          const output = toolResponse.output;
          let contentValue;
          switch (output.type) {
            case "text":
            case "error-text":
              contentValue = output.value;
              break;
            case "execution-denied":
              contentValue = output.reason ?? "Tool execution denied.";
              break;
            case "content":
            case "json":
            case "error-json":
              contentValue = JSON.stringify(output.value);
              break;
          }
          const toolResponseMetadata = getOpenAIMetadata(toolResponse);
          messages.push({
            role: "tool",
            tool_call_id: toolResponse.toolCallId,
            content: contentValue,
            ...toolResponseMetadata
          });
        }
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return messages;
}

// src/minimax-chat-options.ts
var import_v4 = require("zod/v4");
var minimaxChatProviderOptions = import_v4.z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: import_v4.z.string().optional(),
  /**
   * Reasoning effort for reasoning models. Defaults to `medium`.
   */
  reasoningEffort: import_v4.z.string().optional(),
  /**
   * Controls the verbosity of the generated text. Defaults to `medium`.
   */
  textVerbosity: import_v4.z.string().optional()
});
var minimaxErrorDataSchema = import_v4.z.object({
  error: import_v4.z.object({
    message: import_v4.z.string(),
    type: import_v4.z.string().nullish(),
    param: import_v4.z.any().nullish(),
    code: import_v4.z.union([import_v4.z.string(), import_v4.z.number()]).nullish()
  })
});
var defaultMinimaxErrorStructure = {
  errorSchema: minimaxErrorDataSchema,
  errorToMessage: (data) => data.error.message
};

// src/minimax-openai-prepare-tools.ts
var import_provider3 = require("@ai-sdk/provider");
function prepareTools({
  tools,
  toolChoice
}) {
  tools = tools?.length ? tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tools: void 0, toolChoice: void 0, toolWarnings };
  }
  const openaiCompatTools = [];
  for (const tool of tools) {
    if (tool.type === "provider") {
      toolWarnings.push({
        type: "unsupported",
        feature: `provider-defined tool ${tool.id}`
      });
    } else {
      openaiCompatTools.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          ...tool.strict != null ? { strict: tool.strict } : {}
        }
      });
    }
  }
  if (toolChoice == null) {
    return { tools: openaiCompatTools, toolChoice: void 0, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: openaiCompatTools, toolChoice: type, toolWarnings };
    case "tool":
      return {
        tools: openaiCompatTools,
        toolChoice: {
          type: "function",
          function: { name: toolChoice.toolName }
        },
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new import_provider3.UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}

// src/minimax-openai-language-model.ts
function getResponseMetadata({
  id,
  model,
  created
}) {
  return {
    id: id ?? void 0,
    modelId: model ?? void 0,
    timestamp: created != null ? new Date(created * 1e3) : void 0
  };
}
function mapOpenAICompatibleFinishReason(finishReason) {
  switch (finishReason) {
    case "stop":
      return { unified: "stop", raw: finishReason };
    case "length":
      return { unified: "length", raw: finishReason };
    case "content_filter":
      return { unified: "content-filter", raw: finishReason };
    case "function_call":
    case "tool_calls":
      return { unified: "tool-calls", raw: finishReason };
    default:
      return { unified: "other", raw: finishReason ?? void 0 };
  }
}
function buildUsage({
  promptTokens,
  completionTokens,
  cachedTokens,
  reasoningTokens
}) {
  return {
    inputTokens: {
      total: promptTokens,
      noCache: void 0,
      cacheRead: cachedTokens,
      cacheWrite: void 0
    },
    outputTokens: {
      total: completionTokens,
      text: void 0,
      reasoning: reasoningTokens
    }
  };
}
var MinimaxChatLanguageModel = class {
  constructor(modelId, config) {
    this.specificationVersion = "v3";
    this.modelId = modelId;
    this.config = config;
    const errorStructure = config.errorStructure ?? defaultMinimaxErrorStructure;
    this.chunkSchema = createOpenAICompatibleChatChunkSchema(
      errorStructure.errorSchema
    );
    this.failedResponseHandler = (0, import_provider_utils3.createJsonErrorResponseHandler)(errorStructure);
    this.supportsStructuredOutputs = config.supportsStructuredOutputs ?? false;
  }
  get provider() {
    return this.config.provider;
  }
  get providerOptionsName() {
    return this.config.provider.split(".")[0].trim();
  }
  get supportedUrls() {
    return this.config.supportedUrls?.() ?? {};
  }
  async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    providerOptions,
    stopSequences,
    responseFormat,
    seed,
    toolChoice,
    tools
  }) {
    const warnings = [];
    const compatibleOptions = Object.assign(
      await (0, import_provider_utils3.parseProviderOptions)({
        provider: "openai-compatible",
        providerOptions,
        schema: minimaxChatProviderOptions
      }) ?? {},
      await (0, import_provider_utils3.parseProviderOptions)({
        provider: this.providerOptionsName,
        providerOptions,
        schema: minimaxChatProviderOptions
      }) ?? {}
    );
    if (topK != null) {
      warnings.push({ type: "unsupported", feature: "topK" });
    }
    if (responseFormat?.type === "json" && responseFormat.schema != null && !this.supportsStructuredOutputs) {
      warnings.push({
        type: "unsupported",
        feature: "responseFormat",
        details: "JSON response format schema is only supported with structuredOutputs"
      });
    }
    const {
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      toolWarnings
    } = prepareTools({
      tools,
      toolChoice
    });
    return {
      args: {
        model: this.modelId,
        user: compatibleOptions.user,
        max_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        response_format: responseFormat?.type === "json" ? this.supportsStructuredOutputs === true && responseFormat.schema != null ? {
          type: "json_schema",
          json_schema: {
            schema: responseFormat.schema,
            name: responseFormat.name ?? "response",
            description: responseFormat.description
          }
        } : { type: "json_object" } : void 0,
        stop: stopSequences,
        seed,
        ...Object.fromEntries(
          Object.entries(
            providerOptions?.[this.providerOptionsName] ?? {}
          ).filter(
            ([key]) => !Object.keys(minimaxChatProviderOptions.shape).includes(key)
          )
        ),
        reasoning_effort: compatibleOptions.reasoningEffort,
        verbosity: compatibleOptions.textVerbosity,
        // MiniMax specific: enable reasoning_split for M2 models
        reasoning_split: true,
        messages: convertToMinimaxChatMessages(prompt),
        tools: openaiTools,
        tool_choice: openaiToolChoice
      },
      warnings: [...warnings, ...toolWarnings]
    };
  }
  async doGenerate(options) {
    const { args, warnings } = await this.getArgs({ ...options });
    const body = JSON.stringify(args);
    const {
      responseHeaders,
      value: responseBody,
      rawValue: rawResponse
    } = await (0, import_provider_utils3.postJsonToApi)({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: (0, import_provider_utils3.combineHeaders)(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: (0, import_provider_utils3.createJsonResponseHandler)(
        MinimaxChatResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const choice = responseBody.choices[0];
    const content = [];
    const text = choice.message.content;
    if (text != null && text.length > 0) {
      content.push({ type: "text", text });
    }
    if (choice.message.reasoning_details?.length) {
      const reasoningBlock = choice.message.reasoning_details.find(
        (block) => block.type === "reasoning.text"
      );
      if (reasoningBlock?.text) {
        content.push({
          type: "reasoning",
          text: reasoningBlock.text,
          // Store original reasoning_details in providerMetadata for round-trip
          providerMetadata: {
            minimax: {
              reasoningDetails: choice.message.reasoning_details
            }
          }
        });
      }
    }
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: "tool-call",
          toolCallId: toolCall.id ?? (0, import_provider_utils3.generateId)(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments
        });
      }
    }
    const providerMetadata = {
      [this.providerOptionsName]: {},
      ...await this.config.metadataExtractor?.extractMetadata?.({
        parsedBody: rawResponse
      })
    };
    const completionTokenDetails = responseBody.usage?.completion_tokens_details;
    if (completionTokenDetails?.accepted_prediction_tokens != null) {
      providerMetadata[this.providerOptionsName].acceptedPredictionTokens = completionTokenDetails?.accepted_prediction_tokens;
    }
    if (completionTokenDetails?.rejected_prediction_tokens != null) {
      providerMetadata[this.providerOptionsName].rejectedPredictionTokens = completionTokenDetails?.rejected_prediction_tokens;
    }
    return {
      content,
      finishReason: mapOpenAICompatibleFinishReason(choice.finish_reason),
      usage: buildUsage({
        promptTokens: responseBody.usage?.prompt_tokens ?? void 0,
        completionTokens: responseBody.usage?.completion_tokens ?? void 0,
        cachedTokens: responseBody.usage?.prompt_tokens_details?.cached_tokens ?? void 0,
        reasoningTokens: responseBody.usage?.completion_tokens_details?.reasoning_tokens ?? void 0
      }),
      providerMetadata,
      request: { body },
      response: {
        ...getResponseMetadata(responseBody),
        headers: responseHeaders,
        body: rawResponse
      },
      warnings
    };
  }
  async doStream(options) {
    const { args, warnings } = await this.getArgs({ ...options });
    const body = {
      ...args,
      stream: true,
      stream_options: this.config.includeUsage ? { include_usage: true } : void 0
    };
    const metadataExtractor = this.config.metadataExtractor?.createStreamExtractor();
    const { responseHeaders, value: response } = await (0, import_provider_utils3.postJsonToApi)({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: (0, import_provider_utils3.combineHeaders)(this.config.headers(), options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: (0, import_provider_utils3.createEventSourceResponseHandler)(
        this.chunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const toolCalls = [];
    let finishReason = { unified: "other", raw: void 0 };
    const usage = {
      completionTokens: void 0,
      completionTokensDetails: {
        reasoningTokens: void 0,
        acceptedPredictionTokens: void 0,
        rejectedPredictionTokens: void 0
      },
      promptTokens: void 0,
      promptTokensDetails: {
        cachedTokens: void 0
      }
    };
    let isFirstChunk = true;
    const providerOptionsName = this.providerOptionsName;
    let isActiveReasoning = false;
    let isActiveText = false;
    let accumulatedReasoningDetails = [];
    return {
      stream: response.pipeThrough(
        new TransformStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings });
          },
          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: "raw", rawValue: chunk.rawValue });
            }
            if (!chunk.success) {
              finishReason = { unified: "error", raw: "error" };
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            metadataExtractor?.processChunk(chunk.rawValue);
            if ("error" in value) {
              finishReason = { unified: "error", raw: "error" };
              controller.enqueue({ type: "error", error: value.error.message });
              return;
            }
            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value)
              });
            }
            if (value.usage != null) {
              const {
                prompt_tokens,
                completion_tokens,
                prompt_tokens_details,
                completion_tokens_details
              } = value.usage;
              usage.promptTokens = prompt_tokens ?? void 0;
              usage.completionTokens = completion_tokens ?? void 0;
              if (completion_tokens_details?.reasoning_tokens != null) {
                usage.completionTokensDetails.reasoningTokens = completion_tokens_details?.reasoning_tokens;
              }
              if (completion_tokens_details?.accepted_prediction_tokens != null) {
                usage.completionTokensDetails.acceptedPredictionTokens = completion_tokens_details?.accepted_prediction_tokens;
              }
              if (completion_tokens_details?.rejected_prediction_tokens != null) {
                usage.completionTokensDetails.rejectedPredictionTokens = completion_tokens_details?.rejected_prediction_tokens;
              }
              if (prompt_tokens_details?.cached_tokens != null) {
                usage.promptTokensDetails.cachedTokens = prompt_tokens_details?.cached_tokens;
              }
            }
            const choice = value.choices[0];
            if (choice?.finish_reason != null) {
              finishReason = mapOpenAICompatibleFinishReason(
                choice.finish_reason
              );
            }
            if (choice?.delta == null) {
              return;
            }
            const delta = choice.delta;
            if (delta.reasoning_details?.length) {
              if (accumulatedReasoningDetails.length === 0) {
                accumulatedReasoningDetails = delta.reasoning_details;
              } else {
                for (const block of delta.reasoning_details) {
                  const existingIndex = accumulatedReasoningDetails.findIndex(
                    (b) => b.type === block.type && b.id === block.id
                  );
                  if (existingIndex >= 0) {
                    const existing = accumulatedReasoningDetails[existingIndex];
                    if (block.text) {
                      existing.text = (existing.text || "") + block.text;
                    }
                  } else {
                    accumulatedReasoningDetails.push({ ...block });
                  }
                }
              }
              const reasoningBlock = delta.reasoning_details.find(
                (block) => block.type === "reasoning.text"
              );
              if (reasoningBlock?.text) {
                if (!isActiveReasoning) {
                  controller.enqueue({
                    type: "reasoning-start",
                    id: "reasoning-0"
                  });
                  isActiveReasoning = true;
                }
                controller.enqueue({
                  type: "reasoning-delta",
                  id: "reasoning-0",
                  delta: reasoningBlock.text
                });
              }
            }
            if (delta.content) {
              if (!isActiveText) {
                controller.enqueue({ type: "text-start", id: "txt-0" });
                isActiveText = true;
              }
              controller.enqueue({
                type: "text-delta",
                id: "txt-0",
                delta: delta.content
              });
            }
            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;
                if (toolCalls[index] == null) {
                  if (toolCallDelta.id == null) {
                    throw new import_provider4.InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`
                    });
                  }
                  if (toolCallDelta.function?.name == null) {
                    throw new import_provider4.InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`
                    });
                  }
                  controller.enqueue({
                    type: "tool-input-start",
                    id: toolCallDelta.id,
                    toolName: toolCallDelta.function.name
                  });
                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: "function",
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? ""
                    },
                    hasFinished: false
                  };
                  const toolCall2 = toolCalls[index];
                  if (toolCall2.function?.name != null && toolCall2.function?.arguments != null) {
                    if (toolCall2.function.arguments.length > 0) {
                      controller.enqueue({
                        type: "tool-input-delta",
                        id: toolCall2.id,
                        delta: toolCall2.function.arguments
                      });
                    }
                    if ((0, import_provider_utils3.isParsableJson)(toolCall2.function.arguments)) {
                      controller.enqueue({
                        type: "tool-input-end",
                        id: toolCall2.id
                      });
                      controller.enqueue({
                        type: "tool-call",
                        toolCallId: toolCall2.id ?? (0, import_provider_utils3.generateId)(),
                        toolName: toolCall2.function.name,
                        input: toolCall2.function.arguments
                      });
                      toolCall2.hasFinished = true;
                    }
                  }
                  continue;
                }
                const toolCall = toolCalls[index];
                if (toolCall.hasFinished) {
                  continue;
                }
                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function.arguments += toolCallDelta.function?.arguments ?? "";
                }
                controller.enqueue({
                  type: "tool-input-delta",
                  id: toolCall.id,
                  delta: toolCallDelta.function.arguments ?? ""
                });
                if (toolCall.function?.name != null && toolCall.function?.arguments != null && (0, import_provider_utils3.isParsableJson)(toolCall.function.arguments)) {
                  controller.enqueue({
                    type: "tool-input-end",
                    id: toolCall.id
                  });
                  controller.enqueue({
                    type: "tool-call",
                    toolCallId: toolCall.id ?? (0, import_provider_utils3.generateId)(),
                    toolName: toolCall.function.name,
                    input: toolCall.function.arguments
                  });
                  toolCall.hasFinished = true;
                }
              }
            }
          },
          flush(controller) {
            if (isActiveReasoning) {
              controller.enqueue({
                type: "reasoning-end",
                id: "reasoning-0",
                // Attach reasoning_details for round-trip
                providerMetadata: accumulatedReasoningDetails.length > 0 ? {
                  minimax: {
                    reasoningDetails: accumulatedReasoningDetails
                  }
                } : void 0
              });
            }
            if (isActiveText) {
              controller.enqueue({ type: "text-end", id: "txt-0" });
            }
            for (const toolCall of toolCalls.filter(
              (toolCall2) => !toolCall2.hasFinished
            )) {
              controller.enqueue({
                type: "tool-input-end",
                id: toolCall.id
              });
              controller.enqueue({
                type: "tool-call",
                toolCallId: toolCall.id ?? (0, import_provider_utils3.generateId)(),
                toolName: toolCall.function.name,
                input: toolCall.function.arguments
              });
            }
            const providerMetadata = {
              [providerOptionsName]: {},
              ...metadataExtractor?.buildMetadata()
            };
            if (usage.completionTokensDetails.acceptedPredictionTokens != null) {
              providerMetadata[providerOptionsName].acceptedPredictionTokens = usage.completionTokensDetails.acceptedPredictionTokens;
            }
            if (usage.completionTokensDetails.rejectedPredictionTokens != null) {
              providerMetadata[providerOptionsName].rejectedPredictionTokens = usage.completionTokensDetails.rejectedPredictionTokens;
            }
            controller.enqueue({
              type: "finish",
              finishReason,
              usage: buildUsage({
                promptTokens: usage.promptTokens ?? void 0,
                completionTokens: usage.completionTokens ?? void 0,
                cachedTokens: usage.promptTokensDetails.cachedTokens ?? void 0,
                reasoningTokens: usage.completionTokensDetails.reasoningTokens ?? void 0
              }),
              providerMetadata
            });
          }
        })
      ),
      request: { body },
      response: { headers: responseHeaders }
    };
  }
};
var openaiCompatibleTokenUsageSchema = import_v42.z.object({
  prompt_tokens: import_v42.z.number().nullish(),
  completion_tokens: import_v42.z.number().nullish(),
  total_tokens: import_v42.z.number().nullish(),
  prompt_tokens_details: import_v42.z.object({
    cached_tokens: import_v42.z.number().nullish()
  }).nullish(),
  completion_tokens_details: import_v42.z.object({
    reasoning_tokens: import_v42.z.number().nullish(),
    accepted_prediction_tokens: import_v42.z.number().nullish(),
    rejected_prediction_tokens: import_v42.z.number().nullish()
  }).nullish()
}).nullish();
var MinimaxChatResponseSchema = import_v42.z.object({
  id: import_v42.z.string().nullish(),
  created: import_v42.z.number().nullish(),
  model: import_v42.z.string().nullish(),
  choices: import_v42.z.array(
    import_v42.z.object({
      message: import_v42.z.object({
        role: import_v42.z.literal("assistant").nullish(),
        content: import_v42.z.string().nullish(),
        reasoning_details: import_v42.z.array(import_v42.z.any()).nullish(),
        // MiniMax specific
        tool_calls: import_v42.z.array(
          import_v42.z.object({
            id: import_v42.z.string().nullish(),
            function: import_v42.z.object({
              name: import_v42.z.string(),
              arguments: import_v42.z.string()
            })
          })
        ).nullish()
      }),
      finish_reason: import_v42.z.string().nullish()
    })
  ),
  usage: openaiCompatibleTokenUsageSchema
});
var createOpenAICompatibleChatChunkSchema = (errorSchema) => import_v42.z.union([
  import_v42.z.object({
    id: import_v42.z.string().nullish(),
    created: import_v42.z.number().nullish(),
    model: import_v42.z.string().nullish(),
    choices: import_v42.z.array(
      import_v42.z.object({
        delta: import_v42.z.object({
          role: import_v42.z.enum(["assistant"]).nullish(),
          content: import_v42.z.string().nullish(),
          reasoning_details: import_v42.z.array(import_v42.z.any()).nullish(),
          // MiniMax specific
          tool_calls: import_v42.z.array(
            import_v42.z.object({
              index: import_v42.z.number(),
              id: import_v42.z.string().nullish(),
              function: import_v42.z.object({
                name: import_v42.z.string().nullish(),
                arguments: import_v42.z.string().nullish()
              })
            })
          ).nullish()
        }).nullish(),
        finish_reason: import_v42.z.string().nullish()
      })
    ),
    usage: openaiCompatibleTokenUsageSchema
  }),
  errorSchema
]);

// src/minimax-openai-provider.ts
function createMinimax(options = {}) {
  const baseURL = (0, import_provider_utils4.withoutTrailingSlash)(
    options.baseURL ?? "https://api.minimax.io/v1"
  );
  const getHeaders = () => (0, import_provider_utils4.withUserAgentSuffix)(
    {
      Authorization: `Bearer ${(0, import_provider_utils4.loadApiKey)({
        apiKey: options.apiKey,
        environmentVariableName: "MINIMAX_API_KEY",
        description: "MiniMax API key"
      })}`,
      ...options.headers
    },
    `minimax-ai-provider`
  );
  const createLanguageModel = (modelId) => {
    return new MinimaxChatLanguageModel(modelId, {
      provider: `minimax.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch
    });
  };
  const provider = (modelId) => createLanguageModel(modelId);
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.specificationVersion = "v3";
  provider.embeddingModel = (modelId) => {
    throw new import_provider5.NoSuchModelError({ modelId, modelType: "embeddingModel" });
  };
  provider.imageModel = (modelId) => {
    throw new import_provider5.NoSuchModelError({ modelId, modelType: "imageModel" });
  };
  return provider;
}
var minimax = createMinimax();
var minimaxOpenAI = createMinimax();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createMinimax,
  createMinimaxOpenAI,
  minimax,
  minimaxAnthropic,
  minimaxOpenAI
});
//# sourceMappingURL=index.js.map