systems({
    'web': {
        depends: ['db', 'memcached', 'redis'],
        image: {'docker': 'azukiapp/node:5'},
        provision: [
            'npm install'
        ],
        workdir: '/azk/#{manifest.dir}',
        shell: '/bin/bash',
        command: "node --use_strict src/web/web.js",
        wait: 20,
        mounts: {
            '/azk/#{manifest.dir}': sync('.'),
            '/azk/#{manifest.dir}/node_modules': persistent('./node_modules'),
        },
        scalable: {'default': 1},
        http: {
            domains: ['#{manifest.dir}-#{system.name}.#{azk.default_domain}']
        },
        ports: {
            http: '2708/tcp'
        },
        envs: {
            NODE_ENV: 'dev',
            PORT: '2708',
        },
    },
    'collector': {
        depends: ['redis'],
        image: {'docker': 'azukiapp/node:5'},
        provision: [
            'npm install'
        ],
        workdir: '/azk/#{manifest.dir}',
        shell: '/bin/bash',
        command: "node --use_strict src/collector/collector.js",
        wait: 20,
        mounts: {
            '/azk/#{manifest.dir}': sync('.'),
            '/azk/#{manifest.dir}/node_modules': persistent('./node_modules'),
        },
        scalable: {'default': 1},
        envs: {
            NODE_ENV: 'dev',
        },
    },
    'processor': {
        depends: ['redis', 'db'],
        image: {'docker': 'azukiapp/node:5'},
        provision: [
            'npm install'
        ],
        workdir: '/azk/#{manifest.dir}',
        shell: '/bin/bash',
        command: "node --use_strict src/processor/processor.js",
        wait: 20,
        mounts: {
            '/azk/#{manifest.dir}': sync('.'),
            '/azk/#{manifest.dir}/node_modules': persistent('./node_modules'),
        },
        scalable: {'default': 1},
        envs: {
            NODE_ENV: 'dev',
        },
    },
    'prefetch': {
        depends: ['redis', 'db', 'memcached'],
        image: {'docker': 'azukiapp/node:5'},
        provision: [
            'npm install'
        ],
        workdir: '/azk/#{manifest.dir}',
        shell: '/bin/bash',
        command: "node --use_strict src/prefetch/processor.js",
        wait: 20,
        mounts: {
            '/azk/#{manifest.dir}': sync('.'),
            '/azk/#{manifest.dir}/node_modules': persistent('./node_modules'),
        },
        scalable: {'default': 1},
        envs: {
            NODE_ENV: 'dev',
        },
    },
    'db': {
        image: {'docker': 'azukiapp/mongodb'},
        scalable: false,
        wait: {'retry': 20, 'timeout': 1000},
        mounts: {
            '/data/db': persistent('mongodb-#{manifest.dir}'),
        },
        ports: {
            http: '28017:28017/tcp',
        },
        http: {
            domains: ['#{manifest.dir}-#{system.name}.#{azk.default_domain}'],
        },
        export_envs: {
            MONGODB_URI: 'mongodb://#{net.host}:#{net.port[27017]}/#{manifest.dir}_development'
        },
    },
    'memcached': {
        image: {'docker': 'memcached'},
        scalable: false,
        wait: {'retry': 20, 'timeout': 1000},
        ports: {
            http: '11211:11211/tcp'
        },
        http: {
            domains: ['#{manifest.dir}-#{system.name}.#{azk.default_domain}']
        },
        export_envs: {
            MEMCACHED_HOST: '#{net.host}',
            MEMCACHED_PORT: '#{net.port[11211]}'
        }
    },
    'redis': {
        image: { docker: 'redis' },
        ports: {
            http: '6379:6379/tcp'
        },
        http: {
            domains: ['#{manifest.dir}-#{system.name}.#{azk.default_domain}']
        },
        export_envs: {
            REDIS_URL: 'redis://#{manifest.dir}-#{system.name}.#{azk.default_domain}:#{net.port[6379]}',
            REDIS_HOST: '#{net.host}',
            REDIS_PORT: '#{net.port[6379]}'
        }
    }
});
