// src/minimax-anthropic-provider.ts
import { AnthropicMessagesLanguageModel } from "@ai-sdk/anthropic/internal";
import {
  NoSuchModelError
} from "@ai-sdk/provider";
import {
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix
} from "@ai-sdk/provider-utils";
function createMinimaxAnthropic(options = {}) {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? "https://api.minimax.io/anthropic/v1"
  );
  const getHeaders = () => withUserAgentSuffix(
    {
      "anthropic-version": "2023-06-01",
      "x-api-key": loadApiKey({
        apiKey: options.apiKey,
        environmentVariableName: "MINIMAX_API_KEY",
        description: "MiniMax API key"
      }),
      ...options.headers
    },
    `minimax-ai-provider`
  );
  const createLanguageModel = (modelId) => {
    return new AnthropicMessagesLanguageModel(modelId, {
      provider: "minimax.messages",
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId,
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
    throw new NoSuchModelError({ modelId, modelType: "embeddingModel" });
  };
  provider.imageModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "imageModel" });
  };
  return provider;
}
var minimaxAnthropic = createMinimaxAnthropic();

// src/minimax-openai-provider.ts
import {
  NoSuchModelError as NoSuchModelError2
} from "@ai-sdk/provider";
import {
  loadApiKey as loadApiKey2,
  withoutTrailingSlash as withoutTrailingSlash2,
  withUserAgentSuffix as withUserAgentSuffix2
} from "@ai-sdk/provider-utils";

// src/minimax-openai-language-model.ts
import {
  InvalidResponseDataError
} from "@ai-sdk/provider";
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  generateId as generateId2,
  isParsableJson,
  parseProviderOptions,
  postJsonToApi
} from "@ai-sdk/provider-utils";
import { z as z2 } from "zod/v4";

// src/convert-to-minimax-chat-messages.ts
import {
  UnsupportedFunctionalityError
} from "@ai-sdk/provider";
import { convertToBase64 } from "@ai-sdk/provider-utils";
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
                      url: part.data instanceof URL ? part.data.toString() : `data:${mediaType};base64,${convertToBase64(part.data)}`
                    },
                    ...partMetadata
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
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
import { z } from "zod/v4";
var minimaxChatProviderOptions = z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z.string().optional(),
  /**
   * Reasoning effort for reasoning models. Defaults to `medium`.
   */
  reasoningEffort: z.string().optional(),
  /**
   * Controls the verbosity of the generated text. Defaults to `medium`.
   */
  textVerbosity: z.string().optional()
});
var minimaxErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish()
  })
});
var defaultMinimaxErrorStructure = {
  errorSchema: minimaxErrorDataSchema,
  errorToMessage: (data) => data.error.message
};

// src/minimax-openai-prepare-tools.ts
import {
  UnsupportedFunctionalityError as UnsupportedFunctionalityError2
} from "@ai-sdk/provider";
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
      throw new UnsupportedFunctionalityError2({
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
    this.failedResponseHandler = createJsonErrorResponseHandler(errorStructure);
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
      await parseProviderOptions({
        provider: "openai-compatible",
        providerOptions,
        schema: minimaxChatProviderOptions
      }) ?? {},
      await parseProviderOptions({
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
    } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
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
          toolCallId: toolCall.id ?? generateId2(),
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
    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
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
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`
                    });
                  }
                  if (toolCallDelta.function?.name == null) {
                    throw new InvalidResponseDataError({
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
                    if (isParsableJson(toolCall2.function.arguments)) {
                      controller.enqueue({
                        type: "tool-input-end",
                        id: toolCall2.id
                      });
                      controller.enqueue({
                        type: "tool-call",
                        toolCallId: toolCall2.id ?? generateId2(),
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
                if (toolCall.function?.name != null && toolCall.function?.arguments != null && isParsableJson(toolCall.function.arguments)) {
                  controller.enqueue({
                    type: "tool-input-end",
                    id: toolCall.id
                  });
                  controller.enqueue({
                    type: "tool-call",
                    toolCallId: toolCall.id ?? generateId2(),
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
                toolCallId: toolCall.id ?? generateId2(),
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
var openaiCompatibleTokenUsageSchema = z2.object({
  prompt_tokens: z2.number().nullish(),
  completion_tokens: z2.number().nullish(),
  total_tokens: z2.number().nullish(),
  prompt_tokens_details: z2.object({
    cached_tokens: z2.number().nullish()
  }).nullish(),
  completion_tokens_details: z2.object({
    reasoning_tokens: z2.number().nullish(),
    accepted_prediction_tokens: z2.number().nullish(),
    rejected_prediction_tokens: z2.number().nullish()
  }).nullish()
}).nullish();
var MinimaxChatResponseSchema = z2.object({
  id: z2.string().nullish(),
  created: z2.number().nullish(),
  model: z2.string().nullish(),
  choices: z2.array(
    z2.object({
      message: z2.object({
        role: z2.literal("assistant").nullish(),
        content: z2.string().nullish(),
        reasoning_details: z2.array(z2.any()).nullish(),
        // MiniMax specific
        tool_calls: z2.array(
          z2.object({
            id: z2.string().nullish(),
            function: z2.object({
              name: z2.string(),
              arguments: z2.string()
            })
          })
        ).nullish()
      }),
      finish_reason: z2.string().nullish()
    })
  ),
  usage: openaiCompatibleTokenUsageSchema
});
var createOpenAICompatibleChatChunkSchema = (errorSchema) => z2.union([
  z2.object({
    id: z2.string().nullish(),
    created: z2.number().nullish(),
    model: z2.string().nullish(),
    choices: z2.array(
      z2.object({
        delta: z2.object({
          role: z2.enum(["assistant"]).nullish(),
          content: z2.string().nullish(),
          reasoning_details: z2.array(z2.any()).nullish(),
          // MiniMax specific
          tool_calls: z2.array(
            z2.object({
              index: z2.number(),
              id: z2.string().nullish(),
              function: z2.object({
                name: z2.string().nullish(),
                arguments: z2.string().nullish()
              })
            })
          ).nullish()
        }).nullish(),
        finish_reason: z2.string().nullish()
      })
    ),
    usage: openaiCompatibleTokenUsageSchema
  }),
  errorSchema
]);

// src/minimax-openai-provider.ts
function createMinimax(options = {}) {
  const baseURL = withoutTrailingSlash2(
    options.baseURL ?? "https://api.minimax.io/v1"
  );
  const getHeaders = () => withUserAgentSuffix2(
    {
      Authorization: `Bearer ${loadApiKey2({
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
    throw new NoSuchModelError2({ modelId, modelType: "embeddingModel" });
  };
  provider.imageModel = (modelId) => {
    throw new NoSuchModelError2({ modelId, modelType: "imageModel" });
  };
  return provider;
}
var minimax = createMinimax();
var minimaxOpenAI = createMinimax();
export {
  createMinimaxAnthropic as createMinimax,
  createMinimax as createMinimaxOpenAI,
  minimaxAnthropic as minimax,
  minimaxAnthropic,
  minimaxOpenAI
};
//# sourceMappingURL=index.mjs.map