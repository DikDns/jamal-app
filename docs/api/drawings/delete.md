# Delete drawing

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /drawings/{id}:
    delete:
      summary: Delete drawing
      deprecated: false
      description: ''
      tags:
        - Drawings
        - Drawings
      parameters:
        - name: id
          in: path
          description: ''
          required: true
          example: ''
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    format: uuid
                    examples:
                      - 123e4567-e89b-12d3-a456-426614174000
                  name:
                    type: string
                    examples:
                      - My Drawing
                    nullable: true
                  store:
                    type: object
                    description: JSONB object containing tldraw store data
                    x-apidog-orders: []
                    examples:
                      - schemaVersion: 1
                        records: {}
                    properties: {}
                    x-apidog-ignore-properties: []
                  created_at:
                    type: string
                    format: date-time
                  updated_at:
                    type: string
                    format: date-time
                x-apidog-orders:
                  - 01KBEEC92Z7APQS873CXX1P8CG
                x-apidog-refs:
                  01KBEEC92Z7APQS873CXX1P8CG:
                    $ref: '#/components/schemas/Drawing'
                x-apidog-ignore-properties:
                  - id
                  - name
                  - store
                  - created_at
                  - updated_at
              example:
                store:
                  records: {}
                  schemaVersion: 1
                name: null
                created_at: '2025-11-24T18:11:42.268Z'
                updated_at: '2025-11-24T18:11:42.268Z'
          headers: {}
          x-apidog-name: ''
        '404':
          description: Drawing not found
          headers: {}
          x-apidog-name: Not Found
      security: []
      x-apidog-folder: Drawings
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1142423/apis/api-25032434-run
components:
  schemas:
    Drawing:
      type: object
      properties:
        id:
          type: string
          format: uuid
          examples:
            - 123e4567-e89b-12d3-a456-426614174000
        name:
          type: string
          examples:
            - My Drawing
          nullable: true
        store:
          type: object
          description: JSONB object containing tldraw store data
          x-apidog-orders: []
          examples:
            - schemaVersion: 1
              records: {}
          properties: {}
          x-apidog-ignore-properties: []
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
      x-apidog-orders:
        - id
        - name
        - store
        - created_at
        - updated_at
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
  securitySchemes:
    apikey-header-apiKey:
      type: apiKey
      in: header
      name: apiKey
servers:
  - url: https://api.jamal.rplupiproject.com
    description: Prod Env
security:
  - apikey-header-apiKey: []

```