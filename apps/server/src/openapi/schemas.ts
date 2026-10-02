// Server-owned request and response models.
export const schemas = {
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
} as const;
