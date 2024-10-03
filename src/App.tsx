import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import './App.css'
import { Client, type TransactionStream, type LedgerStream } from 'xrpl'
import {
  type CreatedNode,
  type ModifiedNode,
  type DeletedNode,
  isCreatedNode,
  isModifiedNode,
  isDeletedNode,
} from 'xrpl/dist/npm/models'
import { useSearchParams } from 'react-router-dom'
import { networks, mainnet } from 'xrpl-networks'
import Loading from './components/Loading'

const ignoredLedgerEntries = [
  'Invalid',
  'Any',
  'Child',
  'Nickname',
  'Contract',
  'GeneratorMap',
]

function uniqNodes<T extends { index: string; LedgerEntryType: string }>(
  nodes: T[],
): T[] {
  return Array.from(new Map(nodes.map((node) => [node.index, node])).values())
}

function App() {
  const [searchParams] = useSearchParams()
  const [networkName, setNetworkName] = useState<string>()
  const [ledgerIndex, setLedgerIndex] = useState<number>()
  const [ledgerEntries, setLedgerEntries] = useState<string[]>([])
  const [nodes, setNodes] = useState<
    Record<'ledgerIndex' | 'transactions', number> &
      Record<
        'created' | 'modified' | 'deleted',
        { LedgerEntryType: string; index: string }[]
      >
  >({ ledgerIndex: 0, transactions: 0, created: [], modified: [], deleted: [] })

  const maxNodeCounts = useMemo(() => {
    return Math.max(
      nodes.created.length,
      nodes.modified.length,
      nodes.deleted.length,
    )
  }, [nodes.created, nodes.modified, nodes.deleted])

  useEffect(() => {
    const networkId = searchParams.get('networkid') || '0'
    let network = networks.find(
      (network) => String(network.networkId) === networkId,
    )
    if (!network) {
      alert('Invalid network, connecting to mainnet')
      network = mainnet
    }
    setNetworkName(network.name)
    const client = new Client(network.rpc.default.websocket[0])
    const lastNodes: typeof nodes = {
      ledgerIndex: 0,
      transactions: 0,
      created: [],
      modified: [],
      deleted: [],
    }
    const transactionHandler = (tx: TransactionStream) => {
      if (!tx.meta) return
      const modifiedNodes = tx.meta.AffectedNodes.filter((value) =>
        isModifiedNode(value),
      ) as ModifiedNode[]
      const deletedNodes = tx.meta.AffectedNodes.filter((value) =>
        isDeletedNode(value),
      ) as DeletedNode[]
      const createdNodes = tx.meta.AffectedNodes.filter((value) =>
        isCreatedNode(value),
      ) as CreatedNode[]

      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      const currentIndex = tx.ledger_index!
      const newNode = lastNodes.ledgerIndex < currentIndex
      lastNodes.ledgerIndex = currentIndex
      if (newNode) {
        lastNodes.created = []
        lastNodes.modified = []
        lastNodes.deleted = []
        lastNodes.transactions = 0
      }
      lastNodes.created.push(
        ...createdNodes.map((value) => ({
          LedgerEntryType: value.CreatedNode.LedgerEntryType,
          index: value.CreatedNode.LedgerIndex,
        })),
      )
      lastNodes.modified.push(
        ...modifiedNodes.map((value) => ({
          LedgerEntryType: value.ModifiedNode.LedgerEntryType,
          index: value.ModifiedNode.LedgerIndex,
        })),
      )
      lastNodes.deleted.push(
        ...deletedNodes.map((value) => ({
          LedgerEntryType: value.DeletedNode.LedgerEntryType,
          index: value.DeletedNode.LedgerIndex,
        })),
      )

      lastNodes.created = uniqNodes(lastNodes.created)
      lastNodes.modified = uniqNodes(lastNodes.modified)
      lastNodes.deleted = uniqNodes(lastNodes.deleted)

      lastNodes.transactions += 1
    }

    const ledgerClosedHandler = (ledger: LedgerStream) => {
      setLedgerIndex(ledger.ledger_index - 1)
      setNodes(lastNodes)
    }

    client.connect().then(() => {
      client.on('transaction', transactionHandler)
      client.on('ledgerClosed', ledgerClosedHandler)
      client.request({
        command: 'subscribe',
        streams: ['ledger', 'transactions'],
      })
      client
        .request({
          command: 'server_definitions',
        })
        .then((response) => {
          let ledgerEntries = Object.keys(
            response.result.LEDGER_ENTRY_TYPES || {},
          )
          ledgerEntries = ledgerEntries.filter(
            (entry) => !ignoredLedgerEntries.includes(entry),
          )
          setLedgerEntries(ledgerEntries)
        })
    })
    return () => {
      client.off('transaction', transactionHandler)
      client.off('ledgerClosed', ledgerClosedHandler)
    }
  }, [searchParams])

  const nodesByLedgerEntryType = useCallback(
    (entry: string) => {
      return {
        created: nodes.created.filter((node) => node.LedgerEntryType === entry),
        modified: nodes.modified.filter(
          (node) => node.LedgerEntryType === entry,
        ),
        deleted: nodes.deleted.filter((node) => node.LedgerEntryType === entry),
      }
    },
    [nodes.created, nodes.modified, nodes.deleted],
  )

  const Box = ({ color, index }: { color: string; index: number }) => {
    const delayBase = 0.01 / (Number.parseInt(String(maxNodeCounts / 100)) + 1)
    return (
      <motion.div
        initial={{
          scale: 0,
          backgroundColor: color,
          margin: 2,
          width: 24,
          height: 24,
        }}
        animate={{ rotate: 180, scale: 1 }}
        transition={{
          delay: index * delayBase,
          type: 'spring',
          stiffness: 260,
          damping: 20,
        }}
      />
    )
  }

  return (
    <>
      <h1>Live Ledger Entries</h1>
      <h2>{networkName}</h2>
      {ledgerIndex === undefined || nodes.ledgerIndex === 0 ? (
        <Loading />
      ) : (
        <>
          <h3>
            {ledgerIndex
              ? `${ledgerIndex} / ${nodes.transactions} txns`
              : '\u00A0'}
          </h3>
          <motion.div initial={{ minHeight: '240px' }}>
            <motion.div initial={{ textAlign: 'left' }}>
              Created: {nodes.created.length}
            </motion.div>
            <motion.div
              initial={{
                display: 'flex',
                flexWrap: 'wrap',
                minHeight: 24,
                marginBottom: 12,
              }}
            >
              {nodes.created.map((c, i) => (
                <Box key={c.index} index={i} color="blue" />
              ))}
            </motion.div>
            <motion.div initial={{ textAlign: 'left' }}>
              Modified: {nodes.modified.length}
            </motion.div>
            <motion.div
              initial={{
                display: 'flex',
                flexWrap: 'wrap',
                minHeight: 24,
                marginBottom: 12,
              }}
            >
              {nodes.modified.map((c, i) => (
                <Box key={c.index} index={i} color="green" />
              ))}
            </motion.div>
            <motion.div initial={{ textAlign: 'left' }}>
              Deleted: {nodes.deleted.length}
            </motion.div>
            <motion.div
              initial={{
                display: 'flex',
                flexWrap: 'wrap',
                minHeight: 24,
                marginBottom: 36,
              }}
            >
              {nodes.deleted.map((c, i) => (
                <Box key={c.index} index={i} color="red" />
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            initial={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-around',
            }}
          >
            {ledgerEntries.map((entry) => (
              <motion.div
                key={entry}
                initial={{
                  opacity: 0,
                  border: 1,
                  margin: 4,
                  borderStyle: 'solid',
                  borderColor: 'gray',
                  width: '300px',
                  minHeight: '120px',
                }}
                animate={{ opacity: 1 }}
              >
                {entry}
                <motion.div
                  initial={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    marginBottom: 12,
                    paddingLeft: 8,
                    paddingRight: 8,
                  }}
                >
                  {nodesByLedgerEntryType(entry).created.map((node, i) => (
                    <Box key={node.index} index={i} color="blue" />
                  ))}
                  {nodesByLedgerEntryType(entry).modified.map((node, i) => (
                    <Box
                      key={node.index}
                      index={nodesByLedgerEntryType(entry).created.length + i}
                      color="green"
                    />
                  ))}
                  {nodesByLedgerEntryType(entry).deleted.map((node, i) => (
                    <Box
                      key={node.index}
                      index={
                        nodesByLedgerEntryType(entry).created.length +
                        nodesByLedgerEntryType(entry).modified.length +
                        i
                      }
                      color="red"
                    />
                  ))}
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </>
  )
}

export default App
