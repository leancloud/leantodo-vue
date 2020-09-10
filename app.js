const lcApp = new LC.App({
  appId: 'ozewwcwsyq92g2hommuxqrqzg6847wgl8dtrac6suxzko333',
  appKey: 'ni0kwg7h8hwtz6a7dw9ipr7ayk989zo5y8t0sn5gjiel6uav',
  serverURL: 'https://ozewwcws.lc-cn-n1-shared.com',
})
const db = new LC.Storage(lcApp)
const Todo = db.class('Todo')
const User = db.class('_User')

// visibility filters
const filters = {
  all: function (todos) {
    return todos
  },
  active: function (todos) {
    return todos.filter(function (todo) {
      return !todo.done
    })
  },
  completed: function (todos) {
    return todos.filter(function (todo) {
      return todo.done
    })
  }
}

const bind = (subscription, initialStats, onChange) => {
  let stats = [...initialStats]
  const remove = value => {
    stats = stats.filter(target => target.id !== value.id)
    return onChange(stats)
  }
  const upsert = value => {
    let existed = false
    stats = stats.map(target => (target.id === value.id ? ((existed = true), value) : target))
    if (!existed) stats = [value, ...stats]
    return onChange(stats)
  }
  subscription.on('create', upsert)
  subscription.on('update', upsert)
  subscription.on('enter', upsert)
  subscription.on('leave', remove)
  subscription.on('delete', remove)
  return () => {
    subscription.off('create', upsert)
    subscription.off('update', upsert)
    subscription.off('enter', upsert)
    subscription.off('leave', remove)
    subscription.off('delete', remove)
  }
}

// app Vue instance
const app = new Vue({
  // app initial state
  data: {
    todos: [],
    newTodo: '',
    editedTodo: null,
    visibility: 'all',
    username: '',
    password: '',
    user: null
  },

  created: function() {
    const user = User.current()
    if (user) {
      // user.isAuthenticated().then(function(authenticated) {
      //   if (authenticated) {
          this.user = user.toJSON()
      //   }
      // }.bind(this))
    }
  },

  watch: {
    'user.objectId': {
      handler: function (id) {
        if (id) {
          this.fetchTodos(id)
        } else {
          this.todos = []
        }
      },
    }
  },

  // computed properties
  // https://vuejs.org/guide/computed.html
  computed: {
    filteredTodos: function () {
      return filters[this.visibility](this.todos)
    },
    remaining: function () {
      return filters.active(this.todos).length
    },
    allDone: {
      get: function () {
        return this.remaining === 0
      },
      set: function (done) {
        filters[done ? 'active' : 'completed'](this.todos).map(function(todo) {
          todo.done = done
          return Todo.object(todo.objectId).update({ done })
        })
      }
    }
  },

  filters: {
    pluralize: function (n) {
      return n === 1 ? 'item' : 'items'
    }
  },

  // methods that implement data logic.
  // note there's no DOM manipulation here at all.
  methods: {
    fetchTodos: function(id) {
      const query = Todo.where('user', '==', User.object(id)).orderBy('createdAt', 'desc')
      const updateTodos = this.updateTodos.bind(this)
      return Promise.all([query.find().then(updateTodos), query.subscribe()])
        .then(function([todos, subscription]) {
          this.subscription = subscription
          this.unbind = bind(subscription, todos, updateTodos)
        }.bind(this))
        .catch(alert)
    },

    login: function() {
      User.logIn(this.username, this.password).then(function(user) {
        this.user = user.toJSON()
        this.username = this.password = ''
      }.bind(this)).catch(alert)
    },

    signup: function() {
      const data = { username: this.username, password: this.password }
      User.signUp(data).then(function(user) {
        this.user = user.toJSON()
        this.username = this.password = ''
      }.bind(this)).catch(alert)
    },

    logout: function() {
      User.logOut()
      this.user = null
      this.subscription.unsubscribe()
      this.unbind()
    },

    updateTodos: function(todos) {
      this.todos = todos.map(function(todo) {
        return todo.toJSON()
      })
      return todos
    },

    addTodo: function () {
      const value = this.newTodo && this.newTodo.trim()
      if (!value) {
        return
      }
      const acl = new LC.ACL()
      acl.allow(User.current(), 'read')
      acl.allow(User.current(), 'write')
      Todo.add({
        content: value,
        done: false,
        user: User.current(),
        ACL: acl,
      }).then(function(todo) {
        this.todos.push(todo.toJSON())
      }.bind(this)).catch(alert)
      this.newTodo = ''
    },

    removeTodo: function (todo) {
      Todo.object(todo.objectId)
        .delete()
        .then(function() {
          this.todos.splice(this.todos.indexOf(todo), 1)
        }.bind(this))
        .catch(alert)
    },

    editTodo: function (todo) {
      this.beforeEditCache = todo.content
      this.editedTodo = todo
    },

    doneEdit: function (todo) {
      this.editedTodo = null
      todo.content = todo.content.trim()
      Todo.object(todo.objectId).update({
        content: todo.content,
        done: todo.done
      }).catch(alert)
      if (!todo.content) {
        this.removeTodo(todo)
      }
    },

    cancelEdit: function (todo) {
      this.editedTodo = null
      todo.content = this.beforeEditCache
    },

    removeCompleted: function () {
      Promise.all(filters.completed(this.todos).map(function(todo) {
        return Todo.object(todo.objectId).delete()
      })).then(function() {
        this.todos = filters.active(this.todos)
      }.bind(this)).catch(alert)
    }
  },

  // a custom directive to wait for the DOM to be updated
  // before focusing on the input field.
  // https://vuejs.org/guide/custom-directive.html
  directives: {
    'todo-focus': function (el, value) {
      if (value) {
        el.focus()
      }
    }
  }
})

// handle routing
function onHashChange () {
  const visibility = window.location.hash.replace(/#\/?/, '')
  if (filters[visibility]) {
    app.visibility = visibility
  } else {
    window.location.hash = ''
    app.visibility = 'all'
  }
}

window.addEventListener('hashchange', onHashChange)
onHashChange()

// mount
app.$mount('.todoapp')