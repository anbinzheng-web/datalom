// Generated from server routes and endpoint registries; do not edit.
export const apiContract = {
  "openapi": "3.0.3",
  "info": {
    "title": "Datalom API",
    "version": "0.1.0"
  },
  "components": {
    "securitySchemes": {
      "localToken": {
        "type": "http",
        "scheme": "bearer"
      },
      "publicApiKey": {
        "type": "http",
        "scheme": "bearer"
      }
    },
    "schemas": {
      "TaskInput": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "accountId",
          "operation",
          "video"
        ],
        "properties": {
          "accountId": {
            "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "video.detail",
              "video.comments"
            ]
          },
          "video": {
            "type": "string",
            "maxLength": 2048
          },
          "cursor": {
            "type": "string",
            "maxLength": 100
          },
          "count": {
            "type": "integer",
            "minimum": 1,
            "maximum": 50
          },
          "maxPages": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          }
        }
      },
      "TaskSubmission": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "accountId",
          "operation",
          "video"
        ],
        "properties": {
          "accountId": {
            "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "video.detail",
              "video.comments"
            ]
          },
          "video": {
            "type": "string",
            "maxLength": 2048
          },
          "cursor": {
            "type": "string",
            "maxLength": 100
          },
          "count": {
            "type": "integer",
            "minimum": 1,
            "maximum": 50
          },
          "maxPages": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          },
          "requestId": {
            "type": "string",
            "minLength": 8,
            "maxLength": 100
          },
          "deadline": {
            "type": "integer",
            "format": "int64",
            "description": "Unix milliseconds; future deadline within one hour. Defaults to five minutes."
          }
        }
      },
      "TikTokSubmission": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "accountId",
          "video"
        ],
        "properties": {
          "accountId": {
            "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "video.detail",
              "video.comments"
            ]
          },
          "video": {
            "type": "string",
            "maxLength": 2048
          },
          "cursor": {
            "type": "string",
            "maxLength": 100
          },
          "count": {
            "type": "integer",
            "minimum": 1,
            "maximum": 50
          },
          "maxPages": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          },
          "requestId": {
            "type": "string",
            "minLength": 8,
            "maxLength": 100
          },
          "deadline": {
            "type": "integer",
            "format": "int64",
            "description": "Unix milliseconds; future deadline within one hour. Defaults to five minutes."
          }
        }
      },
      "Task": {
        "type": "object",
        "required": [
          "id",
          "requestId",
          "accountId",
          "status",
          "input",
          "result",
          "error",
          "createdAt",
          "updatedAt",
          "deadline",
          "pages",
          "cancelled"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "requestId": {
            "type": "string"
          },
          "accountId": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "queued",
              "running",
              "succeeded",
              "failed",
              "cancelled"
            ]
          },
          "input": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "accountId",
              "operation",
              "video"
            ],
            "properties": {
              "accountId": {
                "type": "string"
              },
              "operation": {
                "type": "string",
                "enum": [
                  "video.detail",
                  "video.comments"
                ]
              },
              "video": {
                "type": "string",
                "maxLength": 2048
              },
              "cursor": {
                "type": "string",
                "maxLength": 100
              },
              "count": {
                "type": "integer",
                "minimum": 1,
                "maximum": 50
              },
              "maxPages": {
                "type": "integer",
                "minimum": 1,
                "maximum": 100
              }
            }
          },
          "result": {
            "description": "Operation-specific JSON; partial results survive failures."
          },
          "error": {
            "type": "object",
            "required": [
              "code",
              "message"
            ],
            "properties": {
              "code": {
                "type": "string"
              },
              "message": {
                "type": "string"
              }
            },
            "nullable": true
          },
          "createdAt": {
            "type": "integer",
            "format": "int64"
          },
          "updatedAt": {
            "type": "integer",
            "format": "int64"
          },
          "deadline": {
            "type": "integer",
            "format": "int64"
          },
          "pages": {
            "type": "integer"
          },
          "cancelled": {
            "type": "integer",
            "enum": [
              0,
              1
            ]
          }
        }
      },
      "Error": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      },
      "ErrorResponse": {
        "type": "object",
        "required": [
          "error"
        ],
        "properties": {
          "error": {
            "type": "object",
            "required": [
              "message"
            ],
            "properties": {
              "code": {
                "type": "string"
              },
              "message": {
                "type": "string"
              }
            }
          },
          "diagnosticId": {
            "type": "string"
          },
          "requestId": {
            "type": "string"
          }
        }
      },
      "Health": {
        "type": "object",
        "required": [
          "ok",
          "version"
        ],
        "properties": {
          "ok": {
            "type": "boolean"
          },
          "version": {
            "type": "string"
          }
        }
      },
      "Cancelled": {
        "type": "object",
        "required": [
          "ok"
        ],
        "properties": {
          "ok": {
            "type": "boolean"
          }
        }
      },
      "PlatformResponse": {
        "type": "object",
        "required": [
          "request_id",
          "data"
        ],
        "properties": {
          "request_id": {
            "type": "string"
          },
          "data": {
            "type": "object",
            "additionalProperties": true,
            "description": "Original platform business response, with session secrets removed. Upstream fields may change independently of v1."
          },
          "pagination": {
            "type": "object",
            "required": [
              "next_cursor",
              "has_more"
            ],
            "properties": {
              "next_cursor": {
                "type": "string",
                "nullable": true
              },
              "has_more": {
                "type": "boolean",
                "nullable": true
              }
            }
          }
        }
      },
      "PublicApiError": {
        "type": "object",
        "required": [
          "request_id",
          "error"
        ],
        "properties": {
          "request_id": {
            "type": "string"
          },
          "error": {
            "type": "object",
            "required": [
              "code",
              "message"
            ],
            "properties": {
              "code": {
                "type": "string"
              },
              "message": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  },
  "paths": {
    "/api/health": {
      "get": {
        "responses": {
          "200": {
            "description": "Default Response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "ok",
                    "version"
                  ],
                  "properties": {
                    "ok": {
                      "type": "boolean"
                    },
                    "version": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/auth": {
      "post": {
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "email",
                  "password"
                ],
                "additionalProperties": false,
                "properties": {
                  "email": {
                    "type": "string"
                  },
                  "password": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/auth/complete": {
      "post": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/auth/session": {
      "get": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      },
      "delete": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/users": {
      "get": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/whitelist": {
      "get": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      },
      "post": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/whitelist/remove": {
      "post": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/logout": {
      "post": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/openapi.json": {
      "get": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/accounts": {
      "get": {
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/accounts/{id}/session/check": {
      "post": {
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "in": "path",
            "name": "id",
            "required": true
          }
        ],
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/accounts/{id}/proxy/check": {
      "post": {
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "in": "path",
            "name": "id",
            "required": true
          }
        ],
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/accounts/{id}/scheduling": {
      "get": {
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "in": "path",
            "name": "id",
            "required": true
          }
        ],
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/accounts/{id}": {
      "get": {
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "in": "path",
            "name": "id",
            "required": true
          }
        ],
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      },
      "patch": {
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "status": {
                    "enum": [
                      "disabled",
                      "pending"
                    ]
                  }
                }
              }
            }
          }
        },
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "in": "path",
            "name": "id",
            "required": true
          }
        ],
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/accounts/{id}/route/verify": {
      "post": {
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "in": "path",
            "name": "id",
            "required": true
          }
        ],
        "responses": {
          "200": {
            "description": "Default Response"
          }
        }
      }
    },
    "/api/v1/tiktok/web/user/detail": {
      "get": {
        "operationId": "tiktok_user_detail",
        "tags": [
          "tiktok"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "username",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "sec_uid",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "Requires username or sec_uid.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/tiktok/web/user/posts": {
      "get": {
        "operationId": "tiktok_user_posts",
        "tags": [
          "tiktok"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "sec_uid",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 4096
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/tiktok/web/video/detail": {
      "get": {
        "operationId": "tiktok_video_detail",
        "tags": [
          "tiktok"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "video_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/tiktok/web/video/comments": {
      "get": {
        "operationId": "tiktok_video_comments",
        "tags": [
          "tiktok"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "video_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 4096
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/tiktok/web/comment/replies": {
      "get": {
        "operationId": "tiktok_comment_replies",
        "tags": [
          "tiktok"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "video_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "comment_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 4096
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/tiktok/web/search/videos": {
      "get": {
        "operationId": "tiktok_search_videos",
        "tags": [
          "tiktok"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "keyword",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 20
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/instagram/web/profile/detail": {
      "get": {
        "operationId": "instagram_profile_detail",
        "tags": [
          "instagram"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/instagram/web/profile/posts": {
      "get": {
        "operationId": "instagram_profile_posts",
        "tags": [
          "instagram"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/instagram/web/profile/reels": {
      "get": {
        "operationId": "instagram_profile_reels",
        "tags": [
          "instagram"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/instagram/web/search/suggestions": {
      "get": {
        "operationId": "instagram_search_suggestions",
        "tags": [
          "instagram"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "keyword",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/instagram/web/search/media": {
      "get": {
        "operationId": "instagram_search_media",
        "tags": [
          "instagram"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "keyword",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/instagram/web/search/media-page": {
      "get": {
        "operationId": "instagram_search_media_page",
        "tags": [
          "instagram"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "keyword",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 30,
              "default": 10
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/instagram/web/media/detail": {
      "get": {
        "operationId": "instagram_media_detail",
        "tags": [
          "instagram"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "media_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/instagram/web/post/comments": {
      "get": {
        "operationId": "instagram_post_comments",
        "tags": [
          "instagram"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "media_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 30,
              "default": 10
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/instagram/web/comment/replies": {
      "get": {
        "operationId": "instagram_comment_replies",
        "tags": [
          "instagram"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "comment_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 30,
              "default": 10
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/reel/detail": {
      "get": {
        "operationId": "facebook_reel_detail",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "video_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/page/header": {
      "get": {
        "operationId": "facebook_page_header",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/page/about": {
      "get": {
        "operationId": "facebook_page_about",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/page/reels": {
      "get": {
        "operationId": "facebook_page_reels",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/marketplace/seller": {
      "get": {
        "operationId": "facebook_marketplace_seller",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "seller_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/marketplace/inventory": {
      "get": {
        "operationId": "facebook_marketplace_inventory",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "seller_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/marketplace/detail": {
      "get": {
        "operationId": "facebook_marketplace_detail",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "listing_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/marketplace/media": {
      "get": {
        "operationId": "facebook_marketplace_media",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "listing_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/post/comments": {
      "get": {
        "operationId": "facebook_post_comments",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "node_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 10
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/comment/replies": {
      "get": {
        "operationId": "facebook_comment_replies",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "node_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 10
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/page/photos": {
      "get": {
        "operationId": "facebook_page_photos",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "node_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 10
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/marketplace/feed": {
      "get": {
        "operationId": "facebook_marketplace_feed",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "listing_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 8
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/facebook/web/marketplace/search": {
      "get": {
        "operationId": "facebook_marketplace_search",
        "tags": [
          "facebook"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "keyword",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 8
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/profile/detail": {
      "get": {
        "operationId": "x_profile_detail",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "username",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/profile/posts": {
      "get": {
        "operationId": "x_profile_posts",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 40,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/profile/replies": {
      "get": {
        "operationId": "x_profile_replies",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 40,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/profile/reposts": {
      "get": {
        "operationId": "x_profile_reposts",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 40,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/profile/media": {
      "get": {
        "operationId": "x_profile_media",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 40,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/profile/followers": {
      "get": {
        "operationId": "x_profile_followers",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 40,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/profile/following": {
      "get": {
        "operationId": "x_profile_following",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 40,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/post/detail": {
      "get": {
        "operationId": "x_post_detail",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "post_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/post/conversation": {
      "get": {
        "operationId": "x_post_conversation",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "post_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "ranking",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024,
              "default": "Relevance"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/x/web/search/timeline": {
      "get": {
        "operationId": "x_search_timeline",
        "tags": [
          "x"
        ],
        "security": [
          {
            "publicApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "keyword",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "product",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024,
              "default": "Latest"
            }
          },
          {
            "name": "count",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 40,
              "default": 20
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 24000
            }
          }
        ],
        "description": "One platform page. Unknown parameters are rejected.",
        "responses": {
          "200": {
            "description": "One platform page",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PlatformResponse"
                }
              }
            }
          },
          "400": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "401": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "429": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "502": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "503": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          },
          "504": {
            "description": "Request failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicApiError"
                }
              }
            }
          }
        }
      }
    }
  },
  "security": [
    {
      "localToken": []
    }
  ]
} as const;
