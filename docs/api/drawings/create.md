# Create a new drawing

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /drawings:
    post:
      summary: Create a new drawing
      deprecated: false
      description: ''
      tags:
        - Drawings
        - Drawings
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateDrawingDto'
            examples: {}
      responses:
        '201':
          description: Drawing created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Drawing'
          headers: {}
          x-apidog-name: Created
        '400':
          description: Bad Request (e.g. store is required)
          headers: {}
          x-apidog-name: Bad Request
      security: []
      x-apidog-folder: Drawings
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1142423/apis/api-25032431-run
components:
  schemas:
    CreateDrawingDto:
      type: object
      required:
        - store
      properties:
        name:
          type: string
          examples:
            - New Drawing
        store:
          type: object
          x-apidog-orders: []
          examples:
            - schemaVersion: 1
              records: {}
          properties: {}
          x-apidog-ignore-properties: []
      x-apidog-orders:
        - name
        - store
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
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