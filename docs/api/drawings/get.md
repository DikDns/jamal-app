# Get all drawings

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /drawings:
    get:
      summary: Get all drawings
      deprecated: false
      description: ''
      tags:
        - Drawings
        - Drawings
      parameters: []
      responses:
        '200':
          description: List of drawings
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Drawing'
          headers: {}
          x-apidog-name: OK
      security: []
      x-apidog-folder: Drawings
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1142423/apis/api-25032430-run
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