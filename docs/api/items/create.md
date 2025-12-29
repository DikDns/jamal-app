# Create a new item

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /items:
    post:
      summary: Create a new item
      deprecated: false
      description: ''
      tags:
        - Items
        - Items
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateItemDto'
      responses:
        '201':
          description: The item has been successfully created.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Item'
          headers: {}
          x-apidog-name: Created
      security:
        - apikey-header-apiKey: []
      x-apidog-folder: Items
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1142423/apis/api-25032426-run
components:
  schemas:
    CreateItemDto:
      type: object
      required:
        - name
      properties:
        name:
          type: string
          examples:
            - New Item
        description:
          type: string
          examples:
            - Optional description
      x-apidog-orders:
        - name
        - description
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
    Item:
      type: object
      properties:
        id:
          type: integer
          examples:
            - 1
        name:
          type: string
          examples:
            - Item A
        description:
          type: string
          examples:
            - Description of Item A
          nullable: true
        created_at:
          type: string
          format: date-time
      x-apidog-orders:
        - id
        - name
        - description
        - created_at
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