# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - button "← Back to Dashboard" [ref=e6] [cursor=pointer]
      - heading "Manage Test Queue" [level=1] [ref=e7]
      - paragraph [ref=e8]: 1 person in queue
    - generic [ref=e9]:
      - button "Call Next ▶" [ref=e10] [cursor=pointer]
      - button "Clear All ✕" [ref=e11] [cursor=pointer]
  - table [ref=e13]:
    - rowgroup [ref=e14]:
      - row "# Data Joined Order Remove" [ref=e15]:
        - columnheader "#" [ref=e16]
        - columnheader "Data" [ref=e17]
        - columnheader "Joined" [ref=e18]
        - columnheader "Order" [ref=e19]
        - columnheader "Remove" [ref=e20]
    - rowgroup [ref=e21]:
      - 'row "2 nome: Remove Me 00:28 ▲ ▼ ✕" [ref=e22]':
        - cell "2" [ref=e23]:
          - generic [ref=e24]: "2"
        - 'cell "nome: Remove Me" [ref=e25]':
          - generic [ref=e27]:
            - generic [ref=e28]: "nome:"
            - text: Remove Me
        - cell "00:28" [ref=e29]
        - cell "▲ ▼" [ref=e30]:
          - generic [ref=e31]:
            - button "▲" [ref=e32] [cursor=pointer]
            - button "▼" [disabled] [ref=e33] [cursor=pointer]
        - cell "✕" [ref=e34]:
          - button "✕" [active] [ref=e35] [cursor=pointer]
```